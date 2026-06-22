import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeId } from "../../../packages/shared/src/index.mjs";

const DEFAULT_DB_PATH = join(process.cwd(), "desktop-data", "tea-local-db.sqlite");

function bool(value) {
  return value === true || value === 1 ? 1 : 0;
}

function fromBool(value) {
  return value === 1;
}

function optional(value) {
  return value === undefined ? null : value;
}

function now() {
  return new Date().toISOString();
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function mapRows(rows, mapper = (row) => row) {
  return rows.map(mapper);
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function isHashedPassword(value) {
  return String(value || "").startsWith("scrypt$");
}

function verifyPassword(password, stored) {
  if (!isHashedPassword(stored)) {
    return String(password) === String(stored || "");
  }
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const actual = Buffer.from(scryptSync(String(password), salt, 64).toString("hex"), "hex");
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function passwordValue(inputPassword, inputHash, existingHash = "") {
  if (inputPassword) return hashPassword(inputPassword);
  if (inputHash && isHashedPassword(inputHash)) return inputHash;
  if (inputHash) return hashPassword(inputHash);
  return existingHash;
}

export class LocalStore {
  constructor(filePath = DEFAULT_DB_PATH) {
    this.filePath = filePath;
    this.db = null;
    this.data = null;
  }

  async load() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const shouldMigrateJson = !existsSync(this.filePath) && existsSync(this.filePath.replace(/\.sqlite$/i, ".json"));

    this.db = new DatabaseSync(this.filePath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
    this.migrateSchema();
    this.seedDefaults();

    if (shouldMigrateJson) {
      await this.migrateJsonFile(this.filePath.replace(/\.sqlite$/i, ".json"));
    }

    this.refreshSnapshot();
    return this.data;
  }

  save() {
    this.refreshSnapshot();
  }

  close() {
    this.db?.close();
  }

  seedDefaults() {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO office_users
         (id, username, display_name, password_hash, role, active)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("office_admin", "office", "Office Admin", hashPassword("office123"), "office_user", 1);

    this.db
      .prepare(
        `INSERT OR IGNORE INTO monthly_settings
         (id, month, tea_price_per_kg, deduction_percent, own_transport_addition_per_kg, factory_transport_deduction_per_kg, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(`settings_${currentMonth()}`, currentMonth(), 200, 2, 5, 3, now());
  }

  migrateSchema() {
    for (const column of [
      ["posted_by_office_user_id", "TEXT"],
      ["posted_by_office_user_name", "TEXT"],
      ["tablet_saved_at", "TEXT"],
      ["tablet_printed_at", "TEXT"]
    ]) {
      if (!this.hasColumn("collection_entries", column[0])) {
        this.db.prepare(`ALTER TABLE collection_entries ADD COLUMN ${column[0]} ${column[1]}`).run();
      }
    }
    for (const column of [
      ["tablet_saved_at", "TEXT"],
      ["tablet_printed_at", "TEXT"]
    ]) {
      if (!this.hasColumn("collection_staging", column[0])) {
        this.db.prepare(`ALTER TABLE collection_staging ADD COLUMN ${column[0]} ${column[1]}`).run();
      }
    }
  }

  hasColumn(table, column) {
    return this.db.prepare(`PRAGMA table_info(${table})`).all().some((info) => info.name === column);
  }

  async migrateJsonFile(jsonPath) {
    const legacy = JSON.parse(await readFile(jsonPath, "utf8"));
    for (const lineUser of legacy.lineUsers || []) await this.upsert("lineUsers", lineUser, "line_user");
    for (const teaLine of legacy.teaLines || []) await this.upsert("teaLines", teaLine, "line");
    for (const supplier of legacy.suppliers || []) await this.upsert("suppliers", supplier, "sup");
    for (const setting of legacy.monthlySettings || []) await this.upsert("monthlySettings", setting, "settings");
    for (const staging of legacy.collectionStaging || []) this.insertStaging(staging);
    for (const entry of legacy.collectionEntries || []) this.insertEntry(entry);
    this.refreshSnapshot();
  }

  login(username, password) {
    const row = this.db
      .prepare(
        `SELECT id, username, display_name AS displayName, role, password_hash AS passwordHash
         FROM office_users
         WHERE username = ? AND active = 1
         LIMIT 1`
      )
      .get(username);
    if (!row || !verifyPassword(password, row.passwordHash)) {
      const error = new Error("Invalid username or password");
      error.status = 401;
      throw error;
    }
    if (!isHashedPassword(row.passwordHash)) {
      this.db.prepare("UPDATE office_users SET password_hash = ? WHERE id = ?").run(hashPassword(password), row.id);
    }
    const { passwordHash, ...user } = row;
    return user;
  }

  loginLineUser({ username, password }) {
    const row = this.db
      .prepare(
        `SELECT id, username, display_name AS displayName, password_hash AS passwordHash
         FROM line_users
         WHERE username = ? AND active = 1
         LIMIT 1`
      )
      .get(username);
    if (!row || !verifyPassword(password, row.passwordHash)) throw new Error("Invalid username or password");
    if (!isHashedPassword(row.passwordHash)) {
      this.db.prepare("UPDATE line_users SET password_hash = ? WHERE id = ?").run(hashPassword(password), row.id);
    }
    const { passwordHash, ...user } = row;
    return user;
  }

  officeUserById(id) {
    const user = this.db
      .prepare(
        `SELECT id, username, display_name AS displayName, role
         FROM office_users
         WHERE id = ? AND active = 1
         LIMIT 1`
      )
      .get(id);
    if (!user) throw new Error("Office user not found");
    return user;
  }

  async updateOfficeProfile(userId, input) {
    const current = this.officeUserById(userId);
    const displayName = String(input.displayName || "").trim();
    const password = String(input.password || "");
    if (!displayName) {
      const error = new Error("Display name is required");
      error.status = 400;
      throw error;
    }
    if (password && password.length < 6) {
      const error = new Error("Password must be at least 6 characters");
      error.status = 400;
      throw error;
    }
    if (password) {
      this.db
        .prepare("UPDATE office_users SET display_name = ?, password_hash = ? WHERE id = ?")
        .run(displayName, hashPassword(password), userId);
    } else {
      this.db.prepare("UPDATE office_users SET display_name = ? WHERE id = ?").run(displayName, userId);
    }
    this.refreshSnapshot();
    return { ...current, displayName };
  }

  async upsert(collection, record, prefix) {
    const saved = { id: record.id || makeId(prefix), ...record, updatedAt: now() };
    if (collection === "lineUsers") this.upsertLineUser(saved);
    else if (collection === "teaLines") this.upsertTeaLine(saved);
    else if (collection === "suppliers") this.upsertSupplier(saved);
    else if (collection === "monthlySettings") this.upsertMonthlySetting(saved);
    else throw new Error(`Unsupported collection: ${collection}`);
    this.refreshSnapshot();
    return saved;
  }

  upsertLineUser(user) {
    const existing = user.id
      ? this.db.prepare("SELECT password_hash AS passwordHash FROM line_users WHERE id = ?").get(user.id)
      : this.db.prepare("SELECT password_hash AS passwordHash FROM line_users WHERE username = ?").get(user.username);
    const passwordHash = passwordValue(user.password, user.passwordHash, existing?.passwordHash || "");
    if (!passwordHash) {
      const error = new Error("Line user password is required");
      error.status = 400;
      throw error;
    }
    this.db
      .prepare(
        `INSERT INTO line_users (id, username, display_name, password_hash, active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           username = excluded.username,
           display_name = excluded.display_name,
           password_hash = excluded.password_hash,
           active = excluded.active,
           updated_at = excluded.updated_at
         ON CONFLICT(username) DO UPDATE SET
           display_name = excluded.display_name,
           password_hash = excluded.password_hash,
           active = excluded.active,
           updated_at = excluded.updated_at`
      )
      .run(user.id, user.username, user.displayName, passwordHash, bool(user.active !== false), user.updatedAt);
  }

  upsertTeaLine(line) {
    this.db
      .prepare(
        `INSERT INTO tea_lines (id, name, active, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           active = excluded.active,
           updated_at = excluded.updated_at
         ON CONFLICT(name) DO UPDATE SET
           active = excluded.active,
           updated_at = excluded.updated_at`
      )
      .run(line.id, line.name, bool(line.active !== false), line.updatedAt);
  }

  upsertSupplier(supplier) {
    const registeredLine = this.db
      .prepare("SELECT id, name FROM tea_lines WHERE lower(name) = lower(?) AND active = 1 LIMIT 1")
      .get(supplier.lineName);
    if (!registeredLine) {
      const error = new Error("Supplier must be assigned to a registered active tea line");
      error.status = 400;
      throw error;
    }
    this.db
      .prepare(
        `INSERT INTO suppliers
         (id, code, name, line_id, line_name, deduction_enabled, own_transport_addition_enabled,
          factory_transport_deduction_enabled, active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           code = excluded.code,
           name = excluded.name,
           line_id = excluded.line_id,
           line_name = excluded.line_name,
           deduction_enabled = excluded.deduction_enabled,
           own_transport_addition_enabled = excluded.own_transport_addition_enabled,
           factory_transport_deduction_enabled = excluded.factory_transport_deduction_enabled,
           active = excluded.active,
           updated_at = excluded.updated_at
         ON CONFLICT(code) DO UPDATE SET
           name = excluded.name,
           line_id = excluded.line_id,
           line_name = excluded.line_name,
           deduction_enabled = excluded.deduction_enabled,
           own_transport_addition_enabled = excluded.own_transport_addition_enabled,
           factory_transport_deduction_enabled = excluded.factory_transport_deduction_enabled,
           active = excluded.active,
           updated_at = excluded.updated_at`
      )
      .run(
        supplier.id,
        supplier.code,
        supplier.name,
        supplier.lineId || registeredLine.id,
        registeredLine.name,
        bool(supplier.deductionEnabled),
        bool(supplier.ownTransportAdditionEnabled),
        bool(supplier.factoryTransportDeductionEnabled),
        bool(supplier.active !== false),
        supplier.updatedAt
      );
  }

  upsertMonthlySetting(setting) {
    const id = setting.id || `settings_${setting.month}`;
    this.db
      .prepare(
        `INSERT INTO monthly_settings
         (id, month, tea_price_per_kg, deduction_percent, own_transport_addition_per_kg,
          factory_transport_deduction_per_kg, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(month) DO UPDATE SET
           tea_price_per_kg = excluded.tea_price_per_kg,
           deduction_percent = excluded.deduction_percent,
           own_transport_addition_per_kg = excluded.own_transport_addition_per_kg,
           factory_transport_deduction_per_kg = excluded.factory_transport_deduction_per_kg,
           updated_at = excluded.updated_at`
      )
      .run(
        id,
        setting.month,
        Number(setting.teaPricePerKg ?? 200),
        Number(setting.deductionPercent ?? 2),
        Number(setting.ownTransportAdditionPerKg ?? 5),
        Number(setting.factoryTransportDeductionPerKg ?? 3),
        setting.updatedAt || now()
      );
  }

  getMasterData() {
    return {
      generatedAt: now(),
      lineUsers: this.lineUsers().filter((user) => user.active),
      teaLines: this.teaLines().filter((line) => line.active),
      suppliers: this.suppliers().filter((supplier) => supplier.active),
      monthlySettings: this.monthlySettings()
    };
  }

  async importCollections(deviceId, records) {
    const imported = [];
    const skipped = [];
    this.db.exec("BEGIN");
    try {
      for (const record of records || []) {
        const duplicate =
          this.db.prepare("SELECT id FROM collection_staging WHERE mobile_record_id = ?").get(record.id) ||
          this.db.prepare("SELECT id FROM collection_entries WHERE mobile_record_id = ?").get(record.id);
        if (duplicate) {
          skipped.push(record.id);
          continue;
        }
        const stagingRecord = {
          id: makeId("stage"),
          mobileRecordId: record.id,
          deviceId,
          supplierId: record.supplierId,
          supplierCode: record.supplierCode,
          supplierName: record.supplierName,
          lineId: record.lineId,
          lineName: record.lineName,
          collectionDate: record.collectionDate,
          collectionTime: record.collectionTime,
          tabletSavedAt: record.tabletSavedAt || [record.collectionDate, record.collectionTime].filter(Boolean).join(" "),
          bagCount: Number(record.bagCount || 0),
          originalGrossWeightKg: Number(record.grossWeightKg || 0),
          grossWeightKg: Number(record.grossWeightKg || 0),
          netWeightKg: Number(record.netWeightKg ?? record.grossWeightKg ?? 0),
          lineUserName: record.lineUserName,
          printStatus: record.printStatus || "unknown",
          tabletPrintedAt: record.printedAt || record.tabletPrintedAt || null,
          importedAt: now(),
          reviewedAt: null,
          status: "pending_review"
        };
        this.insertStaging(stagingRecord);
        imported.push(stagingRecord.id);
      }
      this.db
        .prepare(
          `INSERT INTO sync_log (id, type, device_id, imported_count, skipped_count, synced_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(makeId("sync"), "tablet_import", deviceId, imported.length, skipped.length, now());
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.refreshSnapshot();
    return { imported, skipped };
  }

  async updateStaging(id, updates) {
    const record = this.stagingById(id);
    if (!record) throw new Error("Staging record not found");
    const updated = {
      grossWeightKg: Number(updates.grossWeightKg ?? record.grossWeightKg),
      netWeightKg: Number(updates.netWeightKg ?? record.netWeightKg),
      reviewedAt: now()
    };
    this.db
      .prepare(
        `UPDATE collection_staging
         SET gross_weight_kg = ?, net_weight_kg = ?, reviewed_at = ?
         WHERE id = ?`
      )
      .run(updated.grossWeightKg, updated.netWeightKg, updated.reviewedAt, id);
    this.refreshSnapshot();
    return this.stagingById(id);
  }

  async postStaging(id, officeUser = null) {
    const staging = this.stagingById(id);
    if (!staging) throw new Error("Staging record not found");
    const entry = {
      ...staging,
      id: makeId("entry"),
      postedAt: now(),
      postedByOfficeUserId: officeUser?.id || null,
      postedByOfficeUserName: officeUser?.displayName || officeUser?.username || null
    };
    this.db.exec("BEGIN");
    try {
      this.insertEntry(entry);
      this.db.prepare("DELETE FROM collection_staging WHERE id = ?").run(id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.refreshSnapshot();
    return entry;
  }

  exportForCloud() {
    return {
      suppliers: this.suppliers(),
      collectionEntries: this.collectionEntries(),
      monthlySettings: this.monthlySettings(),
      supplierMonthOverrides: this.supplierMonthOverrides(),
      advances: this.advances(),
      fertilizerInstallments: this.fertilizerInstallments(),
      teaPackets: this.teaPackets(),
      arrears: this.arrears()
    };
  }

  refreshSnapshot() {
    this.data = {
      officeUsers: this.officeUsers(),
      lineUsers: this.lineUsers(),
      teaLines: this.teaLines(),
      suppliers: this.suppliers(),
      monthlySettings: this.monthlySettings(),
      supplierMonthOverrides: this.supplierMonthOverrides(),
      collectionStaging: this.collectionStaging(),
      collectionEntries: this.collectionEntries(),
      advances: this.advances(),
      fertilizerInstallments: this.fertilizerInstallments(),
      teaPackets: this.teaPackets(),
      arrears: this.arrears(),
      syncLog: this.syncLog()
    };
  }

  insertStaging(record) {
    this.db
      .prepare(
        `INSERT INTO collection_staging
         (id, mobile_record_id, device_id, supplier_id, supplier_code, supplier_name, line_id, line_name,
          collection_date, collection_time, bag_count, original_gross_weight_kg, gross_weight_kg,
          net_weight_kg, line_user_name, print_status, tablet_saved_at, tablet_printed_at, imported_at, reviewed_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.mobileRecordId,
        record.deviceId,
        record.supplierId,
        record.supplierCode,
        record.supplierName,
        optional(record.lineId),
        record.lineName,
        record.collectionDate,
        optional(record.collectionTime),
        Number(record.bagCount || 0),
        Number(record.originalGrossWeightKg || 0),
        Number(record.grossWeightKg || 0),
        Number(record.netWeightKg || 0),
        record.lineUserName,
        record.printStatus,
        optional(record.tabletSavedAt),
        optional(record.tabletPrintedAt),
        record.importedAt || now(),
        optional(record.reviewedAt),
        record.status || "pending_review"
      );
  }

  insertEntry(record) {
    this.db
      .prepare(
        `INSERT INTO collection_entries
         (id, mobile_record_id, supplier_id, supplier_code, supplier_name, line_id, line_name,
          collection_date, collection_time, bag_count, original_gross_weight_kg, gross_weight_kg,
          net_weight_kg, line_user_name, print_status, tablet_saved_at, tablet_printed_at,
          posted_at, posted_by_office_user_id, posted_by_office_user_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.mobileRecordId,
        record.supplierId,
        record.supplierCode,
        record.supplierName,
        optional(record.lineId),
        record.lineName,
        record.collectionDate,
        optional(record.collectionTime),
        Number(record.bagCount || 0),
        Number(record.originalGrossWeightKg || 0),
        Number(record.grossWeightKg || 0),
        Number(record.netWeightKg || 0),
        record.lineUserName,
        record.printStatus,
        optional(record.tabletSavedAt),
        optional(record.tabletPrintedAt),
        record.postedAt || now(),
        optional(record.postedByOfficeUserId),
        optional(record.postedByOfficeUserName)
      );
  }

  stagingById(id) {
    const row = this.db.prepare("SELECT * FROM collection_staging WHERE id = ?").get(id);
    return row ? mapStaging(row) : null;
  }

  officeUsers() {
    return mapRows(
      this.db.prepare("SELECT id, username, display_name AS displayName, role, active FROM office_users ORDER BY username").all(),
      (row) => ({ ...row, active: fromBool(row.active) })
    );
  }

  lineUsers() {
    return mapRows(
      this.db
        .prepare("SELECT id, username, display_name AS displayName, password_hash AS passwordHash, active, updated_at AS updatedAt FROM line_users ORDER BY display_name")
        .all(),
      (row) => ({ ...row, active: fromBool(row.active) })
    );
  }

  teaLines() {
    return mapRows(
      this.db.prepare("SELECT id, name, active, updated_at AS updatedAt FROM tea_lines ORDER BY name").all(),
      (row) => ({ ...row, active: fromBool(row.active) })
    );
  }

  suppliers() {
    return mapRows(
      this.db
        .prepare(
          `SELECT id, code, name, line_id AS lineId, line_name AS lineName,
           deduction_enabled AS deductionEnabled,
           own_transport_addition_enabled AS ownTransportAdditionEnabled,
           factory_transport_deduction_enabled AS factoryTransportDeductionEnabled,
           active, updated_at AS updatedAt
           FROM suppliers ORDER BY code`
        )
        .all(),
      (row) => ({
        ...row,
        deductionEnabled: fromBool(row.deductionEnabled),
        ownTransportAdditionEnabled: fromBool(row.ownTransportAdditionEnabled),
        factoryTransportDeductionEnabled: fromBool(row.factoryTransportDeductionEnabled),
        active: fromBool(row.active)
      })
    );
  }

  monthlySettings() {
    return this.db
      .prepare(
        `SELECT id, month, tea_price_per_kg AS teaPricePerKg, deduction_percent AS deductionPercent,
         own_transport_addition_per_kg AS ownTransportAdditionPerKg,
         factory_transport_deduction_per_kg AS factoryTransportDeductionPerKg,
         updated_at AS updatedAt
         FROM monthly_settings ORDER BY month`
      )
      .all();
  }

  supplierMonthOverrides() {
    return mapRows(
      this.db
        .prepare(
          `SELECT id, supplier_id AS supplierId, month, tea_price_per_kg AS teaPricePerKg,
           disable_deduction AS disableDeduction,
           disable_own_transport_addition AS disableOwnTransportAddition,
           disable_factory_transport_deduction AS disableFactoryTransportDeduction
           FROM supplier_month_overrides`
        )
        .all(),
      (row) => ({
        ...row,
        disableDeduction: fromBool(row.disableDeduction),
        disableOwnTransportAddition: fromBool(row.disableOwnTransportAddition),
        disableFactoryTransportDeduction: fromBool(row.disableFactoryTransportDeduction)
      })
    );
  }

  collectionStaging() {
    return this.db.prepare("SELECT * FROM collection_staging ORDER BY imported_at").all().map(mapStaging);
  }

  collectionEntries() {
    return this.db.prepare("SELECT * FROM collection_entries ORDER BY collection_date, collection_time").all().map(mapEntry);
  }

  advances() {
    return this.db.prepare("SELECT id, supplier_id AS supplierId, date, amount, effective_month AS effectiveMonth FROM advances").all();
  }

  fertilizerInstallments() {
    return this.db
      .prepare(
        "SELECT id, fertilizer_issue_id AS fertilizerIssueId, supplier_id AS supplierId, effective_month AS effectiveMonth, amount FROM fertilizer_installments"
      )
      .all();
  }

  teaPackets() {
    return this.db
      .prepare(
        "SELECT id, supplier_id AS supplierId, date, packet_count AS packetCount, per_packet_price AS perPacketPrice, total_amount AS totalAmount, effective_month AS effectiveMonth FROM tea_packets"
      )
      .all();
  }

  arrears() {
    return this.db.prepare("SELECT id, supplier_id AS supplierId, effective_month AS effectiveMonth, amount, note FROM arrears_ledger").all();
  }

  syncLog() {
    return this.db
      .prepare(
        "SELECT id, type, device_id AS deviceId, imported_count AS importedCount, skipped_count AS skippedCount, synced_at AS syncedAt FROM sync_log ORDER BY synced_at DESC"
      )
      .all();
  }
}

function mapStaging(row) {
  return {
    id: row.id,
    mobileRecordId: row.mobile_record_id,
    deviceId: row.device_id,
    supplierId: row.supplier_id,
    supplierCode: row.supplier_code,
    supplierName: row.supplier_name,
    lineId: row.line_id,
    lineName: row.line_name,
    collectionDate: row.collection_date,
    collectionTime: row.collection_time,
    bagCount: row.bag_count,
    originalGrossWeightKg: row.original_gross_weight_kg,
    grossWeightKg: row.gross_weight_kg,
    netWeightKg: row.net_weight_kg,
    lineUserName: row.line_user_name,
    printStatus: row.print_status,
    tabletSavedAt: row.tablet_saved_at,
    tabletPrintedAt: row.tablet_printed_at,
    importedAt: row.imported_at,
    reviewedAt: row.reviewed_at,
    status: row.status
  };
}

function mapEntry(row) {
  return {
    id: row.id,
    mobileRecordId: row.mobile_record_id,
    supplierId: row.supplier_id,
    supplierCode: row.supplier_code,
    supplierName: row.supplier_name,
    lineId: row.line_id,
    lineName: row.line_name,
    collectionDate: row.collection_date,
    collectionTime: row.collection_time,
    bagCount: row.bag_count,
    originalGrossWeightKg: row.original_gross_weight_kg,
    grossWeightKg: row.gross_weight_kg,
    netWeightKg: row.net_weight_kg,
    lineUserName: row.line_user_name,
    printStatus: row.print_status,
    tabletSavedAt: row.tablet_saved_at,
    tabletPrintedAt: row.tablet_printed_at,
    postedAt: row.posted_at,
    postedByOfficeUserId: row.posted_by_office_user_id,
    postedByOfficeUserName: row.posted_by_office_user_name
  };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS office_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS line_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tea_lines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  line_id TEXT,
  line_name TEXT NOT NULL,
  deduction_enabled INTEGER NOT NULL DEFAULT 0,
  own_transport_addition_enabled INTEGER NOT NULL DEFAULT 0,
  factory_transport_deduction_enabled INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monthly_settings (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL UNIQUE,
  tea_price_per_kg REAL NOT NULL DEFAULT 200,
  deduction_percent REAL NOT NULL DEFAULT 2,
  own_transport_addition_per_kg REAL NOT NULL DEFAULT 5,
  factory_transport_deduction_per_kg REAL NOT NULL DEFAULT 3,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supplier_month_overrides (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  month TEXT NOT NULL,
  tea_price_per_kg REAL,
  disable_deduction INTEGER NOT NULL DEFAULT 0,
  disable_own_transport_addition INTEGER NOT NULL DEFAULT 0,
  disable_factory_transport_deduction INTEGER NOT NULL DEFAULT 0,
  UNIQUE (supplier_id, month)
);

CREATE TABLE IF NOT EXISTS collection_staging (
  id TEXT PRIMARY KEY,
  mobile_record_id TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  supplier_code TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  line_id TEXT,
  line_name TEXT NOT NULL,
  collection_date TEXT NOT NULL,
  collection_time TEXT,
  bag_count INTEGER NOT NULL,
  original_gross_weight_kg REAL NOT NULL,
  gross_weight_kg REAL NOT NULL,
  net_weight_kg REAL NOT NULL,
  line_user_name TEXT NOT NULL,
  print_status TEXT NOT NULL,
  tablet_saved_at TEXT,
  tablet_printed_at TEXT,
  imported_at TEXT NOT NULL,
  reviewed_at TEXT,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_entries (
  id TEXT PRIMARY KEY,
  mobile_record_id TEXT NOT NULL UNIQUE,
  supplier_id TEXT NOT NULL,
  supplier_code TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  line_id TEXT,
  line_name TEXT NOT NULL,
  collection_date TEXT NOT NULL,
  collection_time TEXT,
  bag_count INTEGER NOT NULL,
  original_gross_weight_kg REAL NOT NULL,
  gross_weight_kg REAL NOT NULL,
  net_weight_kg REAL NOT NULL,
  line_user_name TEXT NOT NULL,
  print_status TEXT NOT NULL,
  tablet_saved_at TEXT,
  tablet_printed_at TEXT,
  posted_at TEXT NOT NULL,
  posted_by_office_user_id TEXT,
  posted_by_office_user_name TEXT
);

CREATE TABLE IF NOT EXISTS advances (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  effective_month TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fertilizer_installments (
  id TEXT PRIMARY KEY,
  fertilizer_issue_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  effective_month TEXT NOT NULL,
  amount REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS tea_packets (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  date TEXT NOT NULL,
  packet_count INTEGER NOT NULL,
  per_packet_price REAL NOT NULL,
  total_amount REAL NOT NULL,
  effective_month TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS arrears_ledger (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  effective_month TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  device_id TEXT,
  imported_count INTEGER,
  skipped_count INTEGER,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_collection_entries_month_supplier ON collection_entries(collection_date, supplier_id);
CREATE INDEX IF NOT EXISTS idx_collection_staging_mobile_record ON collection_staging(mobile_record_id);
CREATE INDEX IF NOT EXISTS idx_advances_effective_month ON advances(effective_month, supplier_id);
CREATE INDEX IF NOT EXISTS idx_fertilizer_effective_month ON fertilizer_installments(effective_month, supplier_id);
CREATE INDEX IF NOT EXISTS idx_tea_packets_effective_month ON tea_packets(effective_month, supplier_id);
CREATE INDEX IF NOT EXISTS idx_arrears_effective_month ON arrears_ledger(effective_month, supplier_id);
`;
