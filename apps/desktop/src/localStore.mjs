import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildGreenLeafBook, makeId } from "../../../packages/shared/src/index.mjs";

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

function isAfter(value, since) {
  if (!since) return true;
  if (!value) return false;
  return new Date(value).getTime() > new Date(since).getTime();
}

function nextMonthValue(month) {
  const [year, monthNumber] = String(month).split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function previousMonthValue(month) {
  const [year, monthNumber] = String(month).split("-").map(Number);
  const previous = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function paymentMode(value) {
  return value === "bank_transfer" ? "bank_transfer" : "cash";
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

function isWebHashedPassword(value) {
  const [salt, hash] = String(value || "").split(":");
  return Boolean(salt && hash && /^[a-f0-9]{32}$/i.test(salt) && /^[a-f0-9]{64}$/i.test(hash));
}

function isSupportedPasswordHash(value) {
  return isHashedPassword(value) || isWebHashedPassword(value);
}

function verifyPassword(password, stored) {
  if (isWebHashedPassword(stored)) {
    const [salt, expected] = String(stored).split(":");
    const actual = createHash("sha256").update(`${salt}:${password}`).digest("hex");
    return actual === expected;
  }
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
  if (inputHash && isSupportedPasswordHash(inputHash)) return inputHash;
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
         (id, username, display_name, password_hash, role, active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run("office_admin", "office", "Office Admin", hashPassword("office123"), "office_user", 1, now());
    this.db
      .prepare(
        `INSERT OR IGNORE INTO office_users
         (id, username, display_name, password_hash, role, active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run("office_root_admin", "admin", "Admin", hashPassword("admin123"), "admin", 1, now());
    this.db
      .prepare(
        `INSERT OR IGNORE INTO line_users
         (id, username, display_name, password_hash, active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("line_admin", "admin", "Admin", hashPassword("admin123"), 1, now());

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
    for (const [table, column] of [
      ["office_users", ["updated_at", "TEXT"]],
      ["supplier_month_overrides", ["updated_at", "TEXT"]],
      ["advances", ["updated_at", "TEXT"]],
      ["fertilizer_issues", ["updated_at", "TEXT"]],
      ["fertilizer_installments", ["updated_at", "TEXT"]],
      ["tea_packets", ["updated_at", "TEXT"]],
      ["arrears_ledger", ["updated_at", "TEXT"]]
    ]) {
      if (!this.hasColumn(table, column[0])) {
        this.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column[0]} ${column[1]}`).run();
      }
    }
    if (!this.hasColumn("suppliers", "exclude_from_balance")) {
      this.db.prepare("ALTER TABLE suppliers ADD COLUMN exclude_from_balance INTEGER NOT NULL DEFAULT 0").run();
    }
    if (!this.hasColumn("suppliers", "payment_mode")) {
      this.db.prepare("ALTER TABLE suppliers ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'cash'").run();
    }
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS supplier_payments (
          id TEXT PRIMARY KEY,
          supplier_id TEXT NOT NULL,
          month TEXT NOT NULL,
          line_name TEXT,
          scope TEXT NOT NULL,
          amount REAL NOT NULL,
          balance_amount REAL NOT NULL,
          paid_at TEXT NOT NULL,
          paid_by_office_user_id TEXT,
          paid_by_office_user_name TEXT,
          note TEXT,
          UNIQUE (supplier_id, month)
        )`
      )
      .run();
    this.db
      .prepare("CREATE INDEX IF NOT EXISTS idx_supplier_payments_month ON supplier_payments(month, supplier_id)")
      .run();
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          username TEXT,
          display_name TEXT,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT,
          entity_label TEXT,
          summary TEXT,
          before_json TEXT,
          after_json TEXT,
          created_at TEXT NOT NULL
        )`
      )
      .run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(username, created_at)").run();
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS cloud_sync_runs (
          id TEXT PRIMARY KEY,
          mode TEXT NOT NULL,
          backend_url TEXT,
          cursor_from TEXT,
          cursor_to TEXT,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          status TEXT NOT NULL,
          sent_json TEXT,
          received_json TEXT,
          error TEXT
        )`
      )
      .run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_cloud_sync_runs_started_at ON cloud_sync_runs(started_at)").run();
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
    const username = String(input.username || "").trim();
    const displayName = String(input.displayName || "").trim();
    const password = String(input.password || "");
    if (!username) {
      const error = new Error("Username is required");
      error.status = 400;
      throw error;
    }
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
    const duplicate = this.db
      .prepare("SELECT id FROM office_users WHERE username = ? AND id != ? LIMIT 1")
      .get(username, userId);
    if (duplicate) {
      const error = new Error("Username already exists");
      error.status = 409;
      throw error;
    }
    if (password) {
      this.db
        .prepare("UPDATE office_users SET username = ?, display_name = ?, password_hash = ?, updated_at = ? WHERE id = ?")
        .run(username, displayName, hashPassword(password), now(), userId);
    } else {
      this.db.prepare("UPDATE office_users SET username = ?, display_name = ?, updated_at = ? WHERE id = ?").run(username, displayName, now(), userId);
    }
    this.refreshSnapshot();
    return { ...current, username, displayName };
  }

  async upsert(collection, record, prefix) {
    const saved = { id: record.id || makeId(prefix), ...record, updatedAt: now() };
    if (collection === "officeUsers") this.upsertOfficeUser(saved);
    else if (collection === "lineUsers") this.upsertLineUser(saved);
    else if (collection === "teaLines") this.upsertTeaLine(saved);
    else if (collection === "suppliers") this.upsertSupplier(saved);
    else if (collection === "monthlySettings") this.upsertMonthlySetting(saved);
    else if (collection === "supplierMonthOverrides") this.upsertSupplierMonthOverride(saved);
    else if (collection === "advances") this.upsertAdvance(saved);
    else if (collection === "fertilizerIssues") this.upsertFertilizerIssue(saved);
    else if (collection === "teaPackets") this.upsertTeaPacket(saved);
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

  upsertOfficeUser(user) {
    const existing = user.id
      ? this.db.prepare("SELECT password_hash AS passwordHash, role, updated_at AS updatedAt FROM office_users WHERE id = ?").get(user.id)
      : this.db.prepare("SELECT password_hash AS passwordHash, role, updated_at AS updatedAt FROM office_users WHERE username = ?").get(user.username);
    if (existing?.updatedAt && user.updatedAt && new Date(existing.updatedAt) > new Date(user.updatedAt)) return;
    const passwordHash = passwordValue(user.password, user.passwordHash, existing?.passwordHash || "");
    if (!passwordHash) {
      const error = new Error("Office user password is required");
      error.status = 400;
      throw error;
    }
    const role = existing?.role === "admin" ? "admin" : "office_user";
    const active = role === "admin" ? true : user.active !== false;
    this.db
      .prepare(
        `INSERT INTO office_users (id, username, display_name, password_hash, role, active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           username = excluded.username,
           display_name = excluded.display_name,
           password_hash = excluded.password_hash,
           role = excluded.role,
           active = excluded.active,
           updated_at = excluded.updated_at
         ON CONFLICT(username) DO UPDATE SET
           display_name = excluded.display_name,
           password_hash = excluded.password_hash,
           role = excluded.role,
           active = excluded.active,
           updated_at = excluded.updated_at`
      )
      .run(user.id, user.username, user.displayName, passwordHash, role, bool(active), user.updatedAt || now());
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
    this.db
      .prepare("UPDATE suppliers SET line_name = ?, updated_at = ? WHERE line_id = ?")
      .run(line.name, line.updatedAt || now(), line.id);
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
         (id, code, name, line_id, line_name, payment_mode, deduction_enabled, own_transport_addition_enabled,
          factory_transport_deduction_enabled, exclude_from_balance, active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           code = excluded.code,
           name = excluded.name,
           line_id = excluded.line_id,
           line_name = excluded.line_name,
           payment_mode = excluded.payment_mode,
           deduction_enabled = excluded.deduction_enabled,
           own_transport_addition_enabled = excluded.own_transport_addition_enabled,
           factory_transport_deduction_enabled = excluded.factory_transport_deduction_enabled,
           exclude_from_balance = excluded.exclude_from_balance,
           active = excluded.active,
           updated_at = excluded.updated_at
         ON CONFLICT(code) DO UPDATE SET
           name = excluded.name,
           line_id = excluded.line_id,
           line_name = excluded.line_name,
           payment_mode = excluded.payment_mode,
           deduction_enabled = excluded.deduction_enabled,
           own_transport_addition_enabled = excluded.own_transport_addition_enabled,
           factory_transport_deduction_enabled = excluded.factory_transport_deduction_enabled,
           exclude_from_balance = excluded.exclude_from_balance,
           active = excluded.active,
           updated_at = excluded.updated_at`
      )
      .run(
        supplier.id,
        supplier.code,
        supplier.name,
        supplier.lineId || registeredLine.id,
        registeredLine.name,
        paymentMode(supplier.paymentMode),
        bool(supplier.deductionEnabled),
        bool(supplier.ownTransportAdditionEnabled),
        bool(supplier.factoryTransportDeductionEnabled),
        bool(supplier.excludeFromBalance),
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

  upsertSupplierMonthOverride(override) {
    if (!override.supplierId || !override.month) {
      const error = new Error("Supplier and month are required for a supplier price override");
      error.status = 400;
      throw error;
    }
    const id = override.id || `override_${override.supplierId}_${override.month}`;
    this.db
      .prepare(
        `INSERT INTO supplier_month_overrides
         (id, supplier_id, month, tea_price_per_kg, disable_deduction,
          disable_own_transport_addition, disable_factory_transport_deduction, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(supplier_id, month) DO UPDATE SET
           tea_price_per_kg = excluded.tea_price_per_kg,
           disable_deduction = excluded.disable_deduction,
           disable_own_transport_addition = excluded.disable_own_transport_addition,
           disable_factory_transport_deduction = excluded.disable_factory_transport_deduction,
           updated_at = excluded.updated_at`
      )
      .run(
        id,
        override.supplierId,
        override.month,
        override.teaPricePerKg === "" || override.teaPricePerKg === undefined ? null : Number(override.teaPricePerKg),
        bool(override.disableDeduction),
        bool(override.disableOwnTransportAddition),
        bool(override.disableFactoryTransportDeduction),
        override.updatedAt || now()
      );
  }

  upsertAdvance(advance) {
    if (!advance.supplierId || !advance.effectiveMonth || !advance.date) {
      const error = new Error("Supplier, effective month, and advance date are required");
      error.status = 400;
      throw error;
    }
    const amount = Number(advance.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      const error = new Error("Advance amount must be greater than zero");
      error.status = 400;
      throw error;
    }
    this.db
      .prepare(
        `INSERT INTO advances (id, supplier_id, date, amount, effective_month, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           supplier_id = excluded.supplier_id,
           date = excluded.date,
           amount = excluded.amount,
           effective_month = excluded.effective_month,
           updated_at = excluded.updated_at`
      )
      .run(advance.id, advance.supplierId, advance.date, amount, advance.effectiveMonth, advance.updatedAt || now());
  }

  upsertFertilizerIssue(issue) {
    if (!issue.supplierId || !issue.date || !issue.effectiveMonth1) {
      const error = new Error("Supplier, date given, and at least one effective month are required");
      error.status = 400;
      throw error;
    }
    const kgGiven = Number(issue.kgGiven);
    const totalAmount = Number(issue.totalAmount);
    const splitMonths = Number(issue.splitMonths || 1);
    const effectiveMonths = [issue.effectiveMonth1, issue.effectiveMonth2].filter(Boolean).slice(0, splitMonths);
    if (!Number.isFinite(kgGiven) || kgGiven <= 0) {
      const error = new Error("Fertilizer kg must be greater than zero");
      error.status = 400;
      throw error;
    }
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      const error = new Error("Fertilizer rupee value must be greater than zero");
      error.status = 400;
      throw error;
    }
    if (![1, 2].includes(splitMonths) || effectiveMonths.length !== splitMonths) {
      const error = new Error("Fertilizer deduction must be split into one or two effective months");
      error.status = 400;
      throw error;
    }

    const firstAmount = Math.round((totalAmount / splitMonths + Number.EPSILON) * 100) / 100;
    const installmentAmounts =
      splitMonths === 1
        ? [totalAmount]
        : [firstAmount, Math.round((totalAmount - firstAmount + Number.EPSILON) * 100) / 100];

    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `INSERT INTO fertilizer_issues
           (id, supplier_id, date, kg_given, total_amount, split_months, effective_month_1, effective_month_2, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             supplier_id = excluded.supplier_id,
             date = excluded.date,
             kg_given = excluded.kg_given,
             total_amount = excluded.total_amount,
             split_months = excluded.split_months,
             effective_month_1 = excluded.effective_month_1,
             effective_month_2 = excluded.effective_month_2,
             updated_at = excluded.updated_at`
        )
        .run(
          issue.id,
          issue.supplierId,
          issue.date,
          kgGiven,
          totalAmount,
          splitMonths,
          effectiveMonths[0],
          effectiveMonths[1] || null,
          issue.updatedAt || now()
        );
      this.db.prepare("DELETE FROM fertilizer_installments WHERE fertilizer_issue_id = ?").run(issue.id);
      const updatedAt = issue.updatedAt || now();
      const insertInstallment = this.db.prepare(
        `INSERT INTO fertilizer_installments (id, fertilizer_issue_id, supplier_id, effective_month, amount, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      effectiveMonths.forEach((month, index) => {
        insertInstallment.run(`${issue.id}_${month}`, issue.id, issue.supplierId, month, installmentAmounts[index], updatedAt);
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  upsertTeaPacket(packet) {
    if (!packet.supplierId || !packet.date || !packet.effectiveMonth) {
      const error = new Error("Supplier, date, and effective month are required");
      error.status = 400;
      throw error;
    }
    const packetCount = Number(packet.packetCount);
    const perPacketPrice = Number(packet.perPacketPrice);
    const totalAmount = Number(packet.totalAmount ?? packetCount * perPacketPrice);
    if (!Number.isFinite(packetCount) || packetCount <= 0) {
      const error = new Error("Packet count must be greater than zero");
      error.status = 400;
      throw error;
    }
    if (!Number.isFinite(perPacketPrice) || perPacketPrice <= 0) {
      const error = new Error("Per packet price must be greater than zero");
      error.status = 400;
      throw error;
    }
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      const error = new Error("Total packet amount must be greater than zero");
      error.status = 400;
      throw error;
    }
    this.db
      .prepare(
        `INSERT INTO tea_packets
         (id, supplier_id, date, packet_count, per_packet_price, total_amount, effective_month, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           supplier_id = excluded.supplier_id,
           date = excluded.date,
           packet_count = excluded.packet_count,
           per_packet_price = excluded.per_packet_price,
           total_amount = excluded.total_amount,
           effective_month = excluded.effective_month,
           updated_at = excluded.updated_at`
      )
      .run(
        packet.id,
        packet.supplierId,
        packet.date,
        packetCount,
        perPacketPrice,
        totalAmount,
        packet.effectiveMonth,
        packet.updatedAt || now()
      );
  }

  async upsertLineSupplierPriceOverride(input) {
    const lineId = String(input.lineId || "").trim();
    const lineName = String(input.lineName || "").trim();
    const month = String(input.month || "").trim();
    const price = Number(input.teaPricePerKg);
    if ((!lineId && !lineName) || !month || !Number.isFinite(price) || price < 0) {
      const error = new Error("Line, month, and a valid price are required");
      error.status = 400;
      throw error;
    }
    const suppliers = this.db
      .prepare(
        lineId
          ? "SELECT id FROM suppliers WHERE line_id = ? AND active = 1"
          : "SELECT id FROM suppliers WHERE lower(line_name) = lower(?) AND active = 1"
      )
      .all(lineId || lineName);
    this.db.exec("BEGIN");
    try {
      for (const supplier of suppliers) {
        this.upsertSupplierMonthOverride({
          supplierId: supplier.id,
          month,
          teaPricePerKg: price
        });
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.refreshSnapshot();
    return { lineId: lineId || null, lineName, month, teaPricePerKg: price, updatedCount: suppliers.length };
  }

  greenLeafBook(month) {
    const exported = this.exportForCloud();
    const book = this.buildGreenLeafBookWithAutoArrears(month, exported);
    const payments = new Map(this.supplierPayments().filter((payment) => payment.month === book.month).map((payment) => [payment.supplierId, payment]));
    return {
      ...book,
      rows: book.rows.map((row) => ({
        ...row,
        payment: payments.get(row.supplierId) || null
      }))
    };
  }

  buildGreenLeafBookWithAutoArrears(month, exported) {
    const previousMonth = previousMonthValue(month);
    const payments = this.supplierPayments();
    const previousPayments = new Set(payments.filter((payment) => payment.month === previousMonth).map((payment) => payment.supplierId));
    const previousBook = buildGreenLeafBook({ month: previousMonth, ...exported, entries: exported.collectionEntries });
    const existingCarryForward = new Set(
      (exported.arrears || [])
        .filter((item) => item.effectiveMonth === month && String(item.note || "").includes(`from ${previousMonth}`))
        .map((item) => item.supplierId)
    );
    const automaticArrears = previousBook.rows
      .filter((row) => !row.balanceExcluded && row.balanceToPay < 0 && !previousPayments.has(row.supplierId) && !existingCarryForward.has(row.supplierId))
      .map((row) => ({
        id: `auto_arrears_${row.supplierId}_${month}_from_${previousMonth}`,
        supplierId: row.supplierId,
        effectiveMonth: month,
        amount: Math.abs(row.balanceToPay),
        note: `Automatic carry forward from ${previousMonth}`
      }));
    return buildGreenLeafBook({
      month,
      ...exported,
      arrears: [...(exported.arrears || []), ...automaticArrears],
      entries: exported.collectionEntries
    });
  }

  async recordSupplierPayments(input, officeUser = null) {
    const month = String(input.month || "").trim();
    const scope = String(input.scope || "supplier").trim();
    if (!month || !["supplier", "line"].includes(scope)) {
      const error = new Error("Payment month and scope are required");
      error.status = 400;
      throw error;
    }
    const book = this.greenLeafBook(month);
    const rows =
      scope === "line"
        ? book.rows.filter((row) => row.lineName === input.lineName)
        : book.rows.filter((row) => row.supplierId === input.supplierId);
    const payableRows = rows.filter((row) => !row.balanceExcluded);
    if (!payableRows.length) {
      const error = new Error("No payable suppliers found for this payment");
      error.status = 400;
      throw error;
    }
    const paidAt = input.paidAt || now();
    const note = String(input.note || "").trim();
    const explicitAmount = input.amount === "" || input.amount === undefined ? null : Number(input.amount);
    if (explicitAmount !== null && (!Number.isFinite(explicitAmount) || explicitAmount < 0)) {
      const error = new Error("Payment amount must be zero or greater");
      error.status = 400;
      throw error;
    }
    const saved = [];
    const positiveBalanceTotal = money(payableRows.reduce((total, row) => total + Math.max(0, Number(row.balanceToPay || 0)), 0));
    let remainingLineAmount = explicitAmount === null || scope !== "line" ? null : money(explicitAmount);
    this.db.exec("BEGIN");
    try {
      for (const [index, row] of payableRows.entries()) {
        const balanceAmount = money(row.balanceToPay);
        let amount = money(scope === "supplier" && explicitAmount !== null ? explicitAmount : Math.max(0, balanceAmount));
        if (scope === "line" && remainingLineAmount !== null) {
          if (positiveBalanceTotal <= 0) {
            amount = 0;
          } else if (index === payableRows.length - 1) {
            amount = money(remainingLineAmount);
          } else {
            amount = money((Math.max(0, balanceAmount) / positiveBalanceTotal) * explicitAmount);
            remainingLineAmount = money(remainingLineAmount - amount);
          }
        }
        const id = `payment_${row.supplierId}_${month}`;
        this.db
          .prepare(
            `INSERT INTO supplier_payments
             (id, supplier_id, month, line_name, scope, amount, balance_amount, paid_at,
              paid_by_office_user_id, paid_by_office_user_name, note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(supplier_id, month) DO UPDATE SET
               line_name = excluded.line_name,
               scope = excluded.scope,
               amount = excluded.amount,
               balance_amount = excluded.balance_amount,
               paid_at = excluded.paid_at,
               paid_by_office_user_id = excluded.paid_by_office_user_id,
               paid_by_office_user_name = excluded.paid_by_office_user_name,
               note = excluded.note`
          )
          .run(
            id,
            row.supplierId,
            month,
            row.lineName,
            scope,
            amount,
            balanceAmount,
            paidAt,
            optional(officeUser?.id),
            optional(officeUser?.displayName || officeUser?.username),
            optional(note)
          );
        if (balanceAmount < 0) {
          const arrearId = `arrears_${row.supplierId}_${nextMonthValue(month)}_from_${month}`;
          this.db
            .prepare(
              `INSERT INTO arrears_ledger (id, supplier_id, effective_month, amount, note, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 amount = excluded.amount,
                 note = excluded.note,
                 updated_at = excluded.updated_at`
            )
            .run(
              arrearId,
              row.supplierId,
              nextMonthValue(month),
              Math.abs(balanceAmount),
              `Carried forward from ${month}`,
              now()
            );
        }
        saved.push({ supplierId: row.supplierId, month, amount, balanceAmount });
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.refreshSnapshot();
    return { month, scope, recordedCount: saved.length, payments: saved };
  }

  recordAudit(entry) {
    const createdAt = entry.createdAt || now();
    const auditEntry = {
      id: entry.id || makeId("audit"),
      userId: optional(entry.user?.id ?? entry.userId),
      username: optional(entry.user?.username ?? entry.username),
      displayName: optional(entry.user?.displayName ?? entry.displayName),
      action: entry.action,
      entityType: entry.entityType,
      entityId: optional(entry.entityId),
      entityLabel: optional(entry.entityLabel),
      summary: optional(entry.summary),
      beforeJson: entry.before === undefined || entry.before === null ? null : JSON.stringify(entry.before),
      afterJson: entry.after === undefined || entry.after === null ? null : JSON.stringify(entry.after),
      createdAt
    };
    this.db
      .prepare(
        `INSERT INTO audit_log
         (id, user_id, username, display_name, action, entity_type, entity_id, entity_label, summary, before_json, after_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        auditEntry.id,
        auditEntry.userId,
        auditEntry.username,
        auditEntry.displayName,
        auditEntry.action,
        auditEntry.entityType,
        auditEntry.entityId,
        auditEntry.entityLabel,
        auditEntry.summary,
        auditEntry.beforeJson,
        auditEntry.afterJson,
        auditEntry.createdAt
      );
    return auditEntry;
  }

  auditLogs() {
    return this.db
      .prepare(
        `SELECT id, user_id AS userId, username, display_name AS displayName, action,
         entity_type AS entityType, entity_id AS entityId, entity_label AS entityLabel,
         summary, before_json AS beforeJson, after_json AS afterJson, created_at AS createdAt
         FROM audit_log ORDER BY created_at DESC, id DESC`
      )
      .all()
      .map((row) => ({
        ...row,
        before: row.beforeJson ? JSON.parse(row.beforeJson) : null,
        after: row.afterJson ? JSON.parse(row.afterJson) : null
      }));
  }

  monthEndSummary(month) {
    const book = this.greenLeafBook(month);
    const entries = this.collectionEntries();
    const advances = this.advances();
    const fertilizerIssues = this.fertilizerIssues();
    const fertilizerInstallments = this.fertilizerInstallments();
    const teaPackets = this.teaPackets();
    const arrears = this.arrears();
    const payments = this.supplierPayments();
    const supplierBills = book.rows.map((row) => {
      const supplier = this.suppliers().find((item) => item.id === row.supplierId);
      const supplierEntries = entries.filter((entry) => entry.supplierId === row.supplierId && entry.collectionDate.startsWith(book.month));
      const supplierFertilizer = fertilizerIssues
        .filter((issue) => issue.supplierId === row.supplierId && [issue.effectiveMonth1, issue.effectiveMonth2].includes(book.month))
        .map((issue) => {
          const effectiveAmount = money(
            fertilizerInstallments
              .filter((installment) => installment.fertilizerIssueId === issue.id && installment.effectiveMonth === book.month)
              .reduce((total, installment) => total + Number(installment.amount || 0), 0)
          );
          const carriedForwardAmount = money(
            fertilizerInstallments
              .filter((installment) => installment.fertilizerIssueId === issue.id && installment.effectiveMonth > book.month)
              .reduce((total, installment) => total + Number(installment.amount || 0), 0)
          );
          return { ...issue, effectiveAmount, carriedForwardAmount };
        });
      return {
        supplierId: row.supplierId,
        supplierCode: row.supplierCode,
        supplierName: row.supplierName,
        lineName: row.lineName,
        paymentMode: paymentMode(supplier?.paymentMode),
        month: book.month,
        dailyKg: row.dailyKg,
        collectionEntries: supplierEntries,
        pricePerKg: row.pricePerKg,
        totalKg: row.totalKg,
        deductionKg: row.deductionKg,
        finalKg: row.finalKg,
        leafValue: row.leafValue,
        ownTransportAddition: row.ownTransportAddition,
        factoryTransportDeduction: row.factoryTransportDeduction,
        advances: advances.filter((advance) => advance.supplierId === row.supplierId && advance.effectiveMonth === book.month),
        fertilizer: supplierFertilizer,
        teaPackets: teaPackets.filter((packet) => packet.supplierId === row.supplierId && packet.effectiveMonth === book.month),
        arrears: arrears.filter((item) => item.supplierId === row.supplierId && item.effectiveMonth === book.month),
        arrearsCarriedForward: row.arrearsCarriedForward,
        totalAdditions: row.totalAdditions,
        totalDeductions: row.totalDeductions,
        balanceToPay: row.balanceToPay,
        balanceExcluded: row.balanceExcluded,
        payment: payments.find((payment) => payment.supplierId === row.supplierId && payment.month === book.month) || null
      };
    });
    const lineMap = new Map();
    for (const bill of supplierBills) {
      const current = lineMap.get(bill.lineName) || {
        lineName: bill.lineName,
        supplierCount: 0,
        totalKg: 0,
        finalKg: 0,
        leafValue: 0,
        totalAdditions: 0,
        totalDeductions: 0,
        balanceToPay: 0,
        paidCount: 0
      };
      current.supplierCount += 1;
      current.totalKg = money(current.totalKg + bill.totalKg);
      current.finalKg = money(current.finalKg + bill.finalKg);
      current.leafValue = money(current.leafValue + bill.leafValue);
      current.totalAdditions = money(current.totalAdditions + bill.totalAdditions);
      current.totalDeductions = money(current.totalDeductions + bill.totalDeductions);
      if (!bill.balanceExcluded) current.balanceToPay = money(current.balanceToPay + bill.balanceToPay);
      if (bill.payment) current.paidCount += 1;
      lineMap.set(bill.lineName, current);
    }
    return { month: book.month, supplierBills, lineSummaries: [...lineMap.values()] };
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
      officeUsers: this.officeUsersForSync(),
      suppliers: this.suppliers(),
      collectionEntries: this.collectionEntries(),
      monthlySettings: this.monthlySettings(),
      supplierMonthOverrides: this.supplierMonthOverrides(),
      advances: this.advances(),
      fertilizerIssues: this.fertilizerIssues(),
      fertilizerInstallments: this.fertilizerInstallments(),
      teaPackets: this.teaPackets(),
      arrears: this.arrears(),
      supplierPayments: this.supplierPayments()
    };
  }

  exportGreenLeafBookSyncData() {
    return this.exportChangedGreenLeafBookSyncData();
  }

  exportChangedGreenLeafBookSyncData({ since = "", full = false, cursorTo = now(), includeOfficeUsers = true } = {}) {
    const include = (record, field = "updatedAt") => full || isAfter(record[field], since);
    return {
      sync: {
        mode: full || !since ? "full" : "incremental",
        cursorFrom: since || null,
        cursorTo
      },
      officeUsers: includeOfficeUsers ? this.officeUsersForSync().filter((record) => include(record)) : [],
      teaLines: this.teaLines().filter((record) => record.active !== false),
      suppliers: this.suppliers().filter((record) => record.active !== false),
      collectionEntries: this.collectionEntries().filter((record) => include(record, "postedAt")),
      monthlySettings: this.monthlySettings(),
      supplierMonthOverrides: this.supplierMonthOverrides(),
      advances: this.advances().filter((record) => include(record)),
      fertilizerInstallments: this.fertilizerInstallments().filter((record) => include(record)),
      teaPackets: this.teaPackets().filter((record) => include(record)),
      supplierPayments: this.supplierPayments(),
      arrears: this.arrears().filter((record) => include(record, "updatedAt"))
    };
  }

  lastSuccessfulCloudSync() {
    return this.cloudSyncRuns().find((run) => run.status === "success") || null;
  }

  cloudSyncStatus() {
    return {
      lastSuccessfulSync: this.lastSuccessfulCloudSync(),
      recentRuns: this.cloudSyncRuns().slice(0, 10)
    };
  }

  beginCloudSyncRun({ mode, backendUrl, cursorFrom, cursorTo, sent }) {
    const run = {
      id: makeId("cloud_sync"),
      mode,
      backendUrl,
      cursorFrom,
      cursorTo,
      startedAt: now(),
      status: "running",
      sent
    };
    this.db
      .prepare(
        `INSERT INTO cloud_sync_runs
         (id, mode, backend_url, cursor_from, cursor_to, started_at, status, sent_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        run.id,
        run.mode,
        optional(run.backendUrl),
        optional(run.cursorFrom),
        optional(run.cursorTo),
        run.startedAt,
        run.status,
        JSON.stringify(sent || {})
      );
    return run;
  }

  completeCloudSyncRun(id, { received }) {
    this.db
      .prepare(
        `UPDATE cloud_sync_runs
         SET completed_at = ?, status = ?, received_json = ?
         WHERE id = ?`
      )
      .run(now(), "success", JSON.stringify(received || {}), id);
    this.refreshSnapshot();
    return this.cloudSyncRuns().find((run) => run.id === id);
  }

  failCloudSyncRun(id, error) {
    this.db
      .prepare(
        `UPDATE cloud_sync_runs
         SET completed_at = ?, status = ?, error = ?
         WHERE id = ?`
      )
      .run(now(), "failed", error?.message || String(error || "Cloud sync failed"), id);
    this.refreshSnapshot();
    return this.cloudSyncRuns().find((run) => run.id === id);
  }

  importSyncedOfficeUsers(users = []) {
    let importedCount = 0;
    for (const user of users) {
      if (user?.role !== "office_user") continue;
      this.upsertOfficeUser(user);
      importedCount += 1;
    }
    this.refreshSnapshot();
    return { importedCount };
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
      fertilizerIssues: this.fertilizerIssues(),
      fertilizerInstallments: this.fertilizerInstallments(),
      teaPackets: this.teaPackets(),
      arrears: this.arrears(),
      supplierPayments: this.supplierPayments(),
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
      this.db.prepare("SELECT id, username, display_name AS displayName, role, active, updated_at AS updatedAt FROM office_users ORDER BY username").all(),
      (row) => ({ ...row, active: fromBool(row.active) })
    );
  }

  officeUsersForSync() {
    return mapRows(
      this.db
        .prepare(
          `SELECT id, username, display_name AS displayName, password_hash AS passwordHash,
           'office_user' AS role, active, updated_at AS updatedAt
           FROM office_users
           WHERE role = 'office_user'
           ORDER BY username`
        )
        .all(),
      (row) => ({ ...row, active: fromBool(row.active), updatedAt: row.updatedAt || now() })
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
           payment_mode AS paymentMode,
           deduction_enabled AS deductionEnabled,
           own_transport_addition_enabled AS ownTransportAdditionEnabled,
           factory_transport_deduction_enabled AS factoryTransportDeductionEnabled,
           exclude_from_balance AS excludeFromBalance,
           active, updated_at AS updatedAt
           FROM suppliers ORDER BY code`
        )
        .all(),
      (row) => ({
        ...row,
        paymentMode: paymentMode(row.paymentMode),
        deductionEnabled: fromBool(row.deductionEnabled),
        ownTransportAdditionEnabled: fromBool(row.ownTransportAdditionEnabled),
        factoryTransportDeductionEnabled: fromBool(row.factoryTransportDeductionEnabled),
        excludeFromBalance: fromBool(row.excludeFromBalance),
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
           disable_factory_transport_deduction AS disableFactoryTransportDeduction,
           updated_at AS updatedAt
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
    return this.db
      .prepare(
        "SELECT id, supplier_id AS supplierId, date, amount, effective_month AS effectiveMonth, updated_at AS updatedAt FROM advances"
      )
      .all();
  }

  fertilizerInstallments() {
    return this.db
      .prepare(
        "SELECT id, fertilizer_issue_id AS fertilizerIssueId, supplier_id AS supplierId, effective_month AS effectiveMonth, amount, updated_at AS updatedAt FROM fertilizer_installments"
      )
      .all();
  }

  fertilizerIssues() {
    return this.db
      .prepare(
        `SELECT id, supplier_id AS supplierId, date, kg_given AS kgGiven, total_amount AS totalAmount,
         split_months AS splitMonths, effective_month_1 AS effectiveMonth1, effective_month_2 AS effectiveMonth2,
         updated_at AS updatedAt
         FROM fertilizer_issues ORDER BY date DESC, id DESC`
      )
      .all();
  }

  teaPackets() {
    return this.db
      .prepare(
        `SELECT id, supplier_id AS supplierId, date, packet_count AS packetCount,
         per_packet_price AS perPacketPrice, total_amount AS totalAmount,
         effective_month AS effectiveMonth, updated_at AS updatedAt
         FROM tea_packets`
      )
      .all();
  }

  arrears() {
    return this.db.prepare("SELECT id, supplier_id AS supplierId, effective_month AS effectiveMonth, amount, note, updated_at AS updatedAt FROM arrears_ledger").all();
  }

  supplierPayments() {
    return this.db
      .prepare(
        `SELECT id, supplier_id AS supplierId, month, line_name AS lineName, scope, amount,
         balance_amount AS balanceAmount, paid_at AS paidAt, paid_by_office_user_id AS paidByOfficeUserId,
         paid_by_office_user_name AS paidByOfficeUserName, note
         FROM supplier_payments ORDER BY paid_at DESC`
      )
      .all();
  }

  syncLog() {
    return this.db
      .prepare(
        "SELECT id, type, device_id AS deviceId, imported_count AS importedCount, skipped_count AS skippedCount, synced_at AS syncedAt FROM sync_log ORDER BY synced_at DESC"
      )
      .all();
  }

  cloudSyncRuns() {
    return this.db
      .prepare(
        `SELECT id, mode, backend_url AS backendUrl, cursor_from AS cursorFrom,
         cursor_to AS cursorTo, started_at AS startedAt, completed_at AS completedAt,
         status, sent_json AS sentJson, received_json AS receivedJson, error
         FROM cloud_sync_runs
         ORDER BY started_at DESC`
      )
      .all()
      .map((run) => ({
        ...run,
        sent: run.sentJson ? JSON.parse(run.sentJson) : null,
        received: run.receivedJson ? JSON.parse(run.receivedJson) : null
      }));
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
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT
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
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  deduction_enabled INTEGER NOT NULL DEFAULT 0,
  own_transport_addition_enabled INTEGER NOT NULL DEFAULT 0,
  factory_transport_deduction_enabled INTEGER NOT NULL DEFAULT 0,
  exclude_from_balance INTEGER NOT NULL DEFAULT 0,
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
  updated_at TEXT,
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
  effective_month TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS fertilizer_issues (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  date TEXT NOT NULL,
  kg_given REAL NOT NULL,
  total_amount REAL NOT NULL,
  split_months INTEGER NOT NULL,
  effective_month_1 TEXT NOT NULL,
  effective_month_2 TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS fertilizer_installments (
  id TEXT PRIMARY KEY,
  fertilizer_issue_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  effective_month TEXT NOT NULL,
  amount REAL NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS tea_packets (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  date TEXT NOT NULL,
  packet_count INTEGER NOT NULL,
  per_packet_price REAL NOT NULL,
  total_amount REAL NOT NULL,
  effective_month TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS arrears_ledger (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  effective_month TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  month TEXT NOT NULL,
  line_name TEXT,
  scope TEXT NOT NULL,
  amount REAL NOT NULL,
  balance_amount REAL NOT NULL,
  paid_at TEXT NOT NULL,
  paid_by_office_user_id TEXT,
  paid_by_office_user_name TEXT,
  note TEXT,
  UNIQUE (supplier_id, month)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  display_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_label TEXT,
  summary TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  device_id TEXT,
  imported_count INTEGER,
  skipped_count INTEGER,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cloud_sync_runs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  backend_url TEXT,
  cursor_from TEXT,
  cursor_to TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  sent_json TEXT,
  received_json TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_collection_entries_month_supplier ON collection_entries(collection_date, supplier_id);
CREATE INDEX IF NOT EXISTS idx_collection_staging_mobile_record ON collection_staging(mobile_record_id);
CREATE INDEX IF NOT EXISTS idx_advances_effective_month ON advances(effective_month, supplier_id);
CREATE INDEX IF NOT EXISTS idx_fertilizer_effective_month ON fertilizer_installments(effective_month, supplier_id);
CREATE INDEX IF NOT EXISTS idx_tea_packets_effective_month ON tea_packets(effective_month, supplier_id);
CREATE INDEX IF NOT EXISTS idx_arrears_effective_month ON arrears_ledger(effective_month, supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_month ON supplier_payments(month, supplier_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(username, created_at);
CREATE INDEX IF NOT EXISTS idx_cloud_sync_runs_started_at ON cloud_sync_runs(started_at);
`;
