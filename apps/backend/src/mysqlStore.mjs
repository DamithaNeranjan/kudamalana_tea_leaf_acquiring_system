import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { makeId } from "../../../packages/shared/src/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  return hashPassword(password, salt) === stored;
}

function toMysqlDateTime(value = new Date()) {
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toBool(value) {
  return value ? 1 : 0;
}

function fromBool(value) {
  return Boolean(Number(value));
}

function numberOrDefault(value, fallback = 0) {
  return Number(value ?? fallback);
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    active: fromBool(row.active),
    createdAt: row.created_at
  };
}

function dbConfigFromEnv() {
  return {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10)
  };
}

async function ensureDatabase(config) {
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection(serverConfig);
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  } finally {
    await connection.end();
  }
}

async function requireRole(conn, sessionToken, roles) {
  const [rows] = await conn.execute(
    `SELECT users.*
     FROM sessions
     INNER JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ?`,
    [sessionToken]
  );
  const user = rows[0];
  if (!user) {
    const error = new Error("Unauthorized");
    error.status = 401;
    throw error;
  }
  if (!fromBool(user.active) || !roles.includes(user.role)) {
    const error = new Error("Forbidden");
    error.status = 403;
    throw error;
  }
  return user;
}

async function executeSchema(pool) {
  const schemaPath = join(__dirname, "mysql-schema.sql");
  const schema = await readFile(schemaPath, "utf8");
  const statements = schema
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function seedSuperAdmin(pool) {
  await pool.execute(
    `INSERT INTO users (id, username, display_name, role, password_hash, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE username = username`,
    [
      "user_superadmin",
      "superadmin",
      "Super Admin",
      "super_admin",
      hashPassword("admin123"),
      1,
      toMysqlDateTime()
    ]
  );
}

export async function createMySqlStore(config = dbConfigFromEnv()) {
  await ensureDatabase(config);
  const pool = mysql.createPool(config);
  await executeSchema(pool);
  await seedSuperAdmin(pool);

  async function upsertSuppliers(conn, records = []) {
    for (const record of records) {
      if (!record.id) {
        const error = new Error("Synced records must include ids");
        error.status = 400;
        throw error;
      }
      await conn.execute(
        `INSERT INTO suppliers (
          id, code, name, line_id, line_name, deduction_enabled,
          own_transport_addition_enabled, factory_transport_deduction_enabled,
          active, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          code = VALUES(code),
          name = VALUES(name),
          line_id = VALUES(line_id),
          line_name = VALUES(line_name),
          deduction_enabled = VALUES(deduction_enabled),
          own_transport_addition_enabled = VALUES(own_transport_addition_enabled),
          factory_transport_deduction_enabled = VALUES(factory_transport_deduction_enabled),
          active = VALUES(active),
          updated_at = VALUES(updated_at)`,
        [
          record.id,
          record.code || record.supplierCode || record.id,
          record.name || record.supplierName || "Unknown Supplier",
          record.lineId || null,
          record.lineName || "",
          toBool(record.deductionEnabled),
          toBool(record.ownTransportAdditionEnabled),
          toBool(record.factoryTransportDeductionEnabled),
          record.active === false ? 0 : 1,
          toMysqlDateTime(record.updatedAt)
        ]
      );
    }
  }

  async function upsertCollectionEntries(conn, records = []) {
    for (const record of records) {
      if (!record.id) {
        const error = new Error("Synced records must include ids");
        error.status = 400;
        throw error;
      }
      const netWeightKg = numberOrDefault(record.netWeightKg ?? record.net_weight_kg);
      const grossWeightKg = numberOrDefault(record.grossWeightKg ?? record.gross_weight_kg, netWeightKg);
      await conn.execute(
        `INSERT INTO collection_entries (
          id, mobile_record_id, supplier_id, supplier_code, supplier_name,
          line_id, line_name, collection_date, collection_time, bag_count,
          original_gross_weight_kg, gross_weight_kg, net_weight_kg,
          line_user_name, print_status, posted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          mobile_record_id = VALUES(mobile_record_id),
          supplier_id = VALUES(supplier_id),
          supplier_code = VALUES(supplier_code),
          supplier_name = VALUES(supplier_name),
          line_id = VALUES(line_id),
          line_name = VALUES(line_name),
          collection_date = VALUES(collection_date),
          collection_time = VALUES(collection_time),
          bag_count = VALUES(bag_count),
          original_gross_weight_kg = VALUES(original_gross_weight_kg),
          gross_weight_kg = VALUES(gross_weight_kg),
          net_weight_kg = VALUES(net_weight_kg),
          line_user_name = VALUES(line_user_name),
          print_status = VALUES(print_status),
          posted_at = VALUES(posted_at)`,
        [
          record.id,
          record.mobileRecordId || record.mobile_record_id || null,
          record.supplierId || record.supplier_id,
          record.supplierCode || record.supplier_code || "",
          record.supplierName || record.supplier_name || "",
          record.lineId || record.line_id || null,
          record.lineName || record.line_name || "",
          toDateOnly(record.collectionDate || record.collection_date),
          record.collectionTime || record.collection_time || null,
          numberOrDefault(record.bagCount || record.bag_count),
          numberOrDefault(record.originalGrossWeightKg || record.original_gross_weight_kg, grossWeightKg),
          grossWeightKg,
          netWeightKg,
          record.lineUserName || record.line_user_name || "",
          record.printStatus || record.print_status || "synced",
          toMysqlDateTime(record.postedAt || record.posted_at)
        ]
      );
    }
  }

  async function upsertMonthlySettings(conn, records = []) {
    for (const record of records) {
      await conn.execute(
        `INSERT INTO monthly_settings (
          month, tea_price_per_kg, deduction_percent,
          own_transport_addition_per_kg, factory_transport_deduction_per_kg
        )
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          tea_price_per_kg = VALUES(tea_price_per_kg),
          deduction_percent = VALUES(deduction_percent),
          own_transport_addition_per_kg = VALUES(own_transport_addition_per_kg),
          factory_transport_deduction_per_kg = VALUES(factory_transport_deduction_per_kg)`,
        [
          record.month,
          numberOrDefault(record.teaPricePerKg ?? record.tea_price_per_kg, 200),
          numberOrDefault(record.deductionPercent ?? record.deduction_percent, 2),
          numberOrDefault(record.ownTransportAdditionPerKg ?? record.own_transport_addition_per_kg, 5),
          numberOrDefault(record.factoryTransportDeductionPerKg ?? record.factory_transport_deduction_per_kg, 3)
        ]
      );
    }
  }

  async function upsertSupplierMonthOverrides(conn, records = []) {
    for (const record of records) {
      if (!record.id) {
        const error = new Error("Synced records must include ids");
        error.status = 400;
        throw error;
      }
      await conn.execute(
        `INSERT INTO supplier_month_overrides (
          id, supplier_id, month, tea_price_per_kg, disable_deduction,
          disable_own_transport_addition, disable_factory_transport_deduction
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          tea_price_per_kg = VALUES(tea_price_per_kg),
          disable_deduction = VALUES(disable_deduction),
          disable_own_transport_addition = VALUES(disable_own_transport_addition),
          disable_factory_transport_deduction = VALUES(disable_factory_transport_deduction)`,
        [
          record.id,
          record.supplierId || record.supplier_id,
          record.month,
          record.teaPricePerKg ?? record.tea_price_per_kg ?? null,
          toBool(record.disableDeduction || record.disable_deduction),
          toBool(record.disableOwnTransportAddition || record.disable_own_transport_addition),
          toBool(record.disableFactoryTransportDeduction || record.disable_factory_transport_deduction)
        ]
      );
    }
  }

  async function upsertMoneyRows(conn, table, records = [], columns) {
    for (const record of records) {
      if (!record.id) {
        const error = new Error("Synced records must include ids");
        error.status = 400;
        throw error;
      }
      const columnNames = columns.map(([dbName]) => dbName);
      const values = columns.map(([, read]) => read(record));
      const updates = columnNames.map((name) => `${name} = VALUES(${name})`).join(", ");
      await conn.execute(
        `INSERT INTO ${table} (id, ${columnNames.join(", ")})
         VALUES (${["?", ...columnNames.map(() => "?")].join(", ")})
         ON DUPLICATE KEY UPDATE ${updates}`,
        [record.id, ...values]
      );
    }
  }

  return {
    async close() {
      await pool.end();
    },

    async login(username, password) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.execute("SELECT * FROM users WHERE username = ?", [username]);
        const user = rows[0];
        if (!user || !verifyPassword(password, user.password_hash)) {
          const error = new Error("Invalid username or password");
          error.status = 401;
          throw error;
        }
        const token = randomBytes(24).toString("hex");
        await conn.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", [
          token,
          user.id,
          toMysqlDateTime()
        ]);
        await conn.commit();
        return { token, user: publicUser(user) };
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async createDirector(sessionToken, input) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await requireRole(conn, sessionToken, ["super_admin"]);
        if (!input?.username || !input?.password || !input?.displayName) {
          const error = new Error("username, password, and displayName are required");
          error.status = 400;
          throw error;
        }
        const user = {
          id: makeId("user"),
          username: input.username,
          displayName: input.displayName,
          role: "director",
          passwordHash: hashPassword(input.password),
          active: true,
          createdAt: toMysqlDateTime()
        };
        await conn.execute(
          `INSERT INTO users (id, username, display_name, role, password_hash, active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [user.id, user.username, user.displayName, user.role, user.passwordHash, 1, user.createdAt]
        );
        await conn.commit();
        return {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          active: user.active,
          createdAt: user.createdAt
        };
      } catch (error) {
        await conn.rollback();
        if (error.code === "ER_DUP_ENTRY") {
          const conflict = new Error("Username already exists");
          conflict.status = 409;
          throw conflict;
        }
        throw error;
      } finally {
        conn.release();
      }
    },

    async logout(sessionToken) {
      await pool.execute("DELETE FROM sessions WHERE token = ?", [sessionToken]);
      return { ok: true };
    },

    async syncFromDesktop(sessionToken, payload) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const user = await requireRole(conn, sessionToken, ["super_admin", "office_user"]);
        await upsertSuppliers(conn, payload.suppliers);
        await upsertCollectionEntries(conn, payload.collectionEntries);
        await upsertMonthlySettings(conn, payload.monthlySettings);
        await upsertSupplierMonthOverrides(conn, payload.supplierMonthOverrides);
        await upsertMoneyRows(conn, "advances", payload.advances, [
          ["supplier_id", (item) => item.supplierId || item.supplier_id],
          ["date", (item) => toDateOnly(item.date)],
          ["amount", (item) => numberOrDefault(item.amount)],
          ["effective_month", (item) => item.effectiveMonth || item.effective_month]
        ]);
        await upsertMoneyRows(conn, "fertilizer_installments", payload.fertilizerInstallments, [
          ["fertilizer_issue_id", (item) => item.fertilizerIssueId || item.fertilizer_issue_id || item.id],
          ["supplier_id", (item) => item.supplierId || item.supplier_id],
          ["effective_month", (item) => item.effectiveMonth || item.effective_month],
          ["amount", (item) => numberOrDefault(item.amount)]
        ]);
        await upsertMoneyRows(conn, "tea_packets", payload.teaPackets, [
          ["supplier_id", (item) => item.supplierId || item.supplier_id],
          ["date", (item) => toDateOnly(item.date)],
          ["packet_count", (item) => numberOrDefault(item.packetCount || item.packet_count)],
          ["per_packet_price", (item) => numberOrDefault(item.perPacketPrice || item.per_packet_price)],
          ["total_amount", (item) =>
            numberOrDefault(
              item.totalAmount ?? item.total_amount,
              numberOrDefault(item.packetCount || item.packet_count) *
                numberOrDefault(item.perPacketPrice || item.per_packet_price)
            )],
          ["effective_month", (item) => item.effectiveMonth || item.effective_month]
        ]);
        await upsertMoneyRows(conn, "arrears_ledger", payload.arrears, [
          ["supplier_id", (item) => item.supplierId || item.supplier_id],
          ["effective_month", (item) => item.effectiveMonth || item.effective_month],
          ["amount", (item) => numberOrDefault(item.amount)],
          ["note", (item) => item.note || null]
        ]);

        const result = {
          id: makeId("sync"),
          userId: user.id,
          syncedAt: toMysqlDateTime(),
          counts: {
            suppliers: payload.suppliers?.length || 0,
            collectionEntries: payload.collectionEntries?.length || 0,
            advances: payload.advances?.length || 0,
            fertilizerInstallments: payload.fertilizerInstallments?.length || 0,
            teaPackets: payload.teaPackets?.length || 0,
            arrears: payload.arrears?.length || 0
          }
        };
        await conn.execute(
          "INSERT INTO sync_log (id, source, synced_at, summary_json) VALUES (?, ?, ?, ?)",
          [result.id, "desktop", result.syncedAt, JSON.stringify(result.counts)]
        );
        await conn.commit();
        return result;
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async getGreenLeafInput(sessionToken, month) {
      const conn = await pool.getConnection();
      try {
        await requireRole(conn, sessionToken, ["super_admin", "office_user", "director"]);
        const [suppliers] = await conn.execute("SELECT * FROM suppliers WHERE active = TRUE");
        const [entries] = await conn.execute(
          "SELECT * FROM collection_entries WHERE collection_date >= ? AND collection_date < DATE_ADD(?, INTERVAL 1 MONTH)",
          [`${month}-01`, `${month}-01`]
        );
        const [settingsRows] = await conn.execute("SELECT * FROM monthly_settings WHERE month = ?", [month]);
        const [overrides] = await conn.execute("SELECT * FROM supplier_month_overrides WHERE month = ?", [month]);
        const [advances] = await conn.execute("SELECT * FROM advances WHERE effective_month = ?", [month]);
        const [fertilizerInstallments] = await conn.execute(
          "SELECT * FROM fertilizer_installments WHERE effective_month = ?",
          [month]
        );
        const [teaPackets] = await conn.execute("SELECT * FROM tea_packets WHERE effective_month = ?", [month]);
        const [arrears] = await conn.execute("SELECT * FROM arrears_ledger WHERE effective_month = ?", [month]);

        const settings = settingsRows[0];
        return {
          month,
          suppliers: suppliers.map((row) => ({
            id: row.id,
            code: row.code,
            name: row.name,
            lineId: row.line_id,
            lineName: row.line_name,
            deductionEnabled: fromBool(row.deduction_enabled),
            ownTransportAdditionEnabled: fromBool(row.own_transport_addition_enabled),
            factoryTransportDeductionEnabled: fromBool(row.factory_transport_deduction_enabled)
          })),
          entries: entries.map((row) => ({
            id: row.id,
            supplierId: row.supplier_id,
            supplierCode: row.supplier_code,
            supplierName: row.supplier_name,
            lineName: row.line_name,
            collectionDate: toDateOnly(row.collection_date),
            netWeightKg: numberOrDefault(row.net_weight_kg),
            grossWeightKg: numberOrDefault(row.gross_weight_kg)
          })),
          monthlySettings: settings
            ? {
                month: settings.month,
                teaPricePerKg: numberOrDefault(settings.tea_price_per_kg),
                deductionPercent: numberOrDefault(settings.deduction_percent),
                ownTransportAdditionPerKg: numberOrDefault(settings.own_transport_addition_per_kg),
                factoryTransportDeductionPerKg: numberOrDefault(settings.factory_transport_deduction_per_kg)
              }
            : undefined,
          supplierMonthOverrides: overrides.map((row) => ({
            id: row.id,
            supplierId: row.supplier_id,
            month: row.month,
            teaPricePerKg: row.tea_price_per_kg === null ? undefined : numberOrDefault(row.tea_price_per_kg),
            disableDeduction: fromBool(row.disable_deduction),
            disableOwnTransportAddition: fromBool(row.disable_own_transport_addition),
            disableFactoryTransportDeduction: fromBool(row.disable_factory_transport_deduction)
          })),
          advances: advances.map((row) => ({
            id: row.id,
            supplierId: row.supplier_id,
            date: toDateOnly(row.date),
            amount: numberOrDefault(row.amount),
            effectiveMonth: row.effective_month
          })),
          fertilizerInstallments: fertilizerInstallments.map((row) => ({
            id: row.id,
            supplierId: row.supplier_id,
            effectiveMonth: row.effective_month,
            amount: numberOrDefault(row.amount)
          })),
          teaPackets: teaPackets.map((row) => ({
            id: row.id,
            supplierId: row.supplier_id,
            date: toDateOnly(row.date),
            packetCount: numberOrDefault(row.packet_count),
            perPacketPrice: numberOrDefault(row.per_packet_price),
            totalAmount: numberOrDefault(row.total_amount),
            effectiveMonth: row.effective_month
          })),
          arrears: arrears.map((row) => ({
            id: row.id,
            supplierId: row.supplier_id,
            effectiveMonth: row.effective_month,
            amount: numberOrDefault(row.amount),
            note: row.note
          }))
        };
      } finally {
        conn.release();
      }
    }
  };
}

export function loadBackendEnv(cwd = process.cwd()) {
  const envPath = resolve(cwd, ".env");
  return readFile(envPath, "utf8")
    .then((content) => {
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const [key, ...rest] = trimmed.split("=");
        if (!process.env[key]) process.env[key] = rest.join("=").trim();
      }
    })
    .catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
}
