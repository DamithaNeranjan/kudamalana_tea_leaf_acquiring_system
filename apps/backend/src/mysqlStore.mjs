import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import {
  DEFAULT_MASTER_DATA_UPDATED_AT,
  DEFAULT_SUPPLIERS,
  DEFAULT_TEA_LINES,
  buildGreenLeafBookWithAutoArrears,
  makeId,
  suggestAdvancePayment
} from "../../../packages/shared/src/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (String(stored || "").startsWith("scrypt$")) {
    const [, salt, hash] = String(stored).split("$");
    if (!salt || !hash) return false;
    const actual = Buffer.from(scryptSync(String(password), salt, 64).toString("hex"), "hex");
    const expected = Buffer.from(hash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  return hashPassword(password, salt) === stored;
}

function toMysqlDateTime(value = new Date()) {
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
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

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function paymentMode(value) {
  return value === "bank_transfer" ? "bank_transfer" : "cash";
}

function normalizeMonth(month) {
  if (/^\d{4}-\d{2}$/.test(String(month || ""))) return month;
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function previousMonthValue(month) {
  const [year, monthNumber] = normalizeMonth(month).split("-").map(Number);
  const previous = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    active: fromBool(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at
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
  const [supplierPaymentModeColumns] = await pool.query("SHOW COLUMNS FROM suppliers LIKE 'payment_mode'");
  if (!supplierPaymentModeColumns.length) {
    await pool.query("ALTER TABLE suppliers ADD COLUMN payment_mode VARCHAR(40) NOT NULL DEFAULT 'cash' AFTER line_name");
  }
  const [teaLineWholeBankTransferColumns] = await pool.query("SHOW COLUMNS FROM tea_lines LIKE 'whole_line_bank_transfer'");
  if (!teaLineWholeBankTransferColumns.length) {
    await pool.query(
      "ALTER TABLE tea_lines ADD COLUMN whole_line_bank_transfer BOOLEAN NOT NULL DEFAULT FALSE AFTER name"
    );
  }
  const [supplierExcludeColumns] = await pool.query("SHOW COLUMNS FROM suppliers LIKE 'exclude_from_balance'");
  if (!supplierExcludeColumns.length) {
    await pool.query(
      "ALTER TABLE suppliers ADD COLUMN exclude_from_balance BOOLEAN NOT NULL DEFAULT FALSE AFTER factory_transport_deduction_enabled"
    );
  }
  const [userUpdatedAtColumns] = await pool.query("SHOW COLUMNS FROM users LIKE 'updated_at'");
  if (!userUpdatedAtColumns.length) {
    await pool.query("ALTER TABLE users ADD COLUMN updated_at DATETIME NULL AFTER created_at");
    await pool.query("UPDATE users SET updated_at = created_at WHERE updated_at IS NULL");
  }
  const [passwordHashColumns] = await pool.query("SHOW COLUMNS FROM users LIKE 'password_hash'");
  if (passwordHashColumns[0] && Number(passwordHashColumns[0].Type.match(/\d+/)?.[0] || 0) < 220) {
    await pool.query("ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(220) NOT NULL");
  }
  for (const table of ["balance_transfer_signals", "factory_officer_transfer_signals", "advance_signals"]) {
    for (const [column, definition] of [
      ["read_at", "DATETIME NULL"],
      ["read_by_user_id", "VARCHAR(80) NULL"],
      ["read_by_display_name", "VARCHAR(160) NULL"]
    ]) {
      const [columns] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
      if (!columns.length) {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    }
  }
  for (const table of ["balance_transfer_signals", "factory_officer_transfer_signals"]) {
    const [columns] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE 'payment_done_date'`);
    if (!columns.length) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN payment_done_date DATE NULL AFTER amount`);
    }
  }
}

function mapBalanceSignal(row) {
  return {
    id: row.id,
    month: row.month,
    section: row.section,
    targetId: row.target_id,
    targetLabel: row.target_label,
    amount: numberOrDefault(row.amount),
    paymentDoneDate: toDateOnly(row.payment_done_date),
    comment: row.comment || "",
    markedAt: row.marked_at,
    markedByUserId: row.marked_by_user_id,
    markedByDisplayName: row.marked_by_display_name,
    readAt: row.read_at,
    readByUserId: row.read_by_user_id,
    readByDisplayName: row.read_by_display_name
  };
}

function mapFactoryOfficerSignal(row) {
  return {
    id: row.id,
    month: row.month,
    amount: numberOrDefault(row.amount),
    paymentDoneDate: toDateOnly(row.payment_done_date),
    comment: row.comment || "",
    markedAt: row.marked_at,
    markedByUserId: row.marked_by_user_id,
    markedByDisplayName: row.marked_by_display_name,
    readAt: row.read_at,
    readByUserId: row.read_by_user_id,
    readByDisplayName: row.read_by_display_name
  };
}

function parseJsonValue(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function mapAdvanceSignal(row) {
  return {
    id: row.id,
    scope: row.scope,
    targetId: row.target_id,
    targetLabel: row.target_label,
    effectiveMonth: row.effective_month,
    dateGiven: toDateOnly(row.date_given),
    suggestedAmount: numberOrDefault(row.suggested_amount),
    amount: numberOrDefault(row.amount),
    breakdown: parseJsonValue(row.breakdown_json, []),
    comment: row.comment || "",
    markedAt: row.marked_at,
    markedByUserId: row.marked_by_user_id,
    markedByDisplayName: row.marked_by_display_name,
    readAt: row.read_at,
    readByUserId: row.read_by_user_id,
    readByDisplayName: row.read_by_display_name
  };
}

function sanitizeAuditValue(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/password|hash|token|authorization/i.test(key))
        .map(([key, child]) => [key, sanitizeAuditValue(child)])
    );
  }
  return value;
}

function mapWebAuditLog(row) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    summary: row.summary,
    before: parseJsonValue(row.before_json, null),
    after: parseJsonValue(row.after_json, null),
    createdAt: row.created_at
  };
}

async function recordWebAudit(conn, user, entry) {
  await conn.execute(
    `INSERT INTO web_audit_log
     (id, user_id, username, display_name, role, action, entity_type, entity_id,
      entity_label, summary, before_json, after_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      makeId("web_audit"),
      user?.id || null,
      user?.username || "",
      user?.display_name || user?.displayName || user?.username || "",
      user?.role || "",
      entry.action,
      entry.entityType,
      entry.entityId || "",
      entry.entityLabel || "",
      entry.summary || "",
      entry.before === undefined ? null : JSON.stringify(sanitizeAuditValue(entry.before)),
      entry.after === undefined ? null : JSON.stringify(sanitizeAuditValue(entry.after)),
      toMysqlDateTime()
    ]
  );
}

function assertCanChangeSignal(signal, user) {
  if (!signal) {
    const error = new Error("Signal not found");
    error.status = 404;
    throw error;
  }
  if (user.role !== "super_admin" && signal.markedByUserId !== user.id) {
    const error = new Error("Directors can change only records they added");
    error.status = 403;
    throw error;
  }
}

function supplierAdvanceBreakdown(input, supplier) {
  const suggestion = suggestAdvancePayment({ ...input, supplierId: supplier.id });
  return {
    supplierId: supplier.id,
    supplierCode: supplier.code,
    supplierName: supplier.name,
    lineId: supplier.lineId,
    lineName: supplier.lineName,
    suggestedAmount: suggestion.suggestedAmount,
    leafValue: suggestion.leafValue,
    arrearsCarriedForward: suggestion.arrearsCarriedForward,
    totalAdvances: suggestion.totalAdvances
  };
}

function buildAdvanceSuggestion(input, scope, targetId) {
  const suppliers = (input.suppliers || []).filter((supplier) => supplier.active !== false);
  const lines = (input.teaLines || []).filter((line) => line.active !== false);
  if (scope === "line") {
    const line = lines.find((item) => item.id === targetId || item.name === targetId);
    if (!line) {
      const error = new Error("Tea line not found");
      error.status = 404;
      throw error;
    }
    const breakdown = suppliers
      .filter((supplier) => supplier.lineId === line.id || supplier.lineName === line.name)
      .map((supplier) => supplierAdvanceBreakdown(input, supplier))
      .filter((item) => item.leafValue > 0 || item.arrearsCarriedForward > 0 || item.totalAdvances > 0 || item.suggestedAmount > 0);
    return {
      scope: "line",
      targetId: line.id,
      targetLabel: line.name,
      suggestedAmount: money(breakdown.reduce((total, item) => total + Number(item.suggestedAmount || 0), 0)),
      breakdown
    };
  }
  const supplier = suppliers.find((item) => item.id === targetId);
  if (!supplier) {
    const error = new Error("Supplier not found");
    error.status = 404;
    throw error;
  }
  const breakdown = [supplierAdvanceBreakdown(input, supplier)];
  return {
    scope: "supplier",
    targetId: supplier.id,
    targetLabel: `${supplier.code || ""} ${supplier.name || ""}`.trim(),
    suggestedAmount: breakdown[0].suggestedAmount,
    breakdown
  };
}

function buildBalances(input, balanceSignals, factorySignals) {
  const book = buildGreenLeafBookWithAutoArrears(input);
  const teaLineMap = new Map((input.teaLines || []).map((line) => [line.id || line.name, line]));
  const lineRows = new Map();
  const supplierRows = [];
  const factorySupplierRows = [];

  for (const row of book.rows.filter((item) => !item.balanceExcluded)) {
    const line = teaLineMap.get(row.lineId) || teaLineMap.get(row.lineName) || {};
    const positiveBalance = Math.max(0, Number(row.balanceToPay || 0));
    if (line.wholeLineBankTransfer) {
      const lineKey = row.lineId || row.lineName;
      const current = lineRows.get(lineKey) || {
        lineId: row.lineId || lineKey,
        lineName: row.lineName || line.name || "",
        supplierCount: 0,
        positiveBalance: 0
      };
      current.supplierCount += 1;
      current.positiveBalance = money(current.positiveBalance + positiveBalance);
      lineRows.set(lineKey, current);
    } else if (row.paymentMode === "bank_transfer") {
      supplierRows.push({
        supplierId: row.supplierId,
        supplierCode: row.supplierCode,
        supplierName: row.supplierName,
        lineName: row.lineName,
        balanceToPay: row.balanceToPay,
        positiveBalance
      });
    } else {
      factorySupplierRows.push({
        supplierId: row.supplierId,
        supplierCode: row.supplierCode,
        supplierName: row.supplierName,
        lineName: row.lineName,
        balanceToPay: row.balanceToPay
      });
    }
  }

  const signalKey = (section, targetId) => `${book.month}:${section}:${targetId}`;
  const signals = new Map(balanceSignals.map((signal) => [signalKey(signal.section, signal.targetId), signal]));
  const lineWiseBankTransfers = [...lineRows.values()]
    .filter((row) => row.positiveBalance > 0)
    .map((row) => ({ ...row, signal: signals.get(signalKey("line", row.lineId || row.lineName)) || null }))
    .sort((a, b) => a.lineName.localeCompare(b.lineName));
  const supplierWiseBankTransfers = supplierRows
    .filter((row) => row.positiveBalance > 0)
    .map((row) => ({ ...row, signal: signals.get(signalKey("supplier", row.supplierId)) || null }))
    .sort((a, b) => String(a.supplierCode || "").localeCompare(String(b.supplierCode || "")));
  const positiveBalance = money(factorySupplierRows.reduce((total, row) => total + Math.max(0, Number(row.balanceToPay || 0)), 0));
  const negativeBalance = money(factorySupplierRows.reduce((total, row) => total + Math.min(0, Number(row.balanceToPay || 0)), 0));
  let runningRemaining = positiveBalance;
  const payments = factorySignals
    .sort((a, b) => new Date(a.markedAt) - new Date(b.markedAt))
    .map((payment) => {
      runningRemaining = money(Math.max(0, runningRemaining - Number(payment.amount || 0)));
      return { ...payment, remainingPositiveBalance: runningRemaining };
    });

  return {
    month: book.month,
    lineWiseBankTransfers,
    supplierWiseBankTransfers,
    factoryOfficerTransfers: {
      suppliers: factorySupplierRows.sort((a, b) => String(a.supplierCode || "").localeCompare(String(b.supplierCode || ""))),
      positiveBalance,
      negativeBalance,
      payments,
      remainingPositiveBalance: runningRemaining
    }
  };
}

async function seedDefaultUsers(pool) {
  for (const user of [
    { id: "user_superadmin", username: "superadmin", displayName: "Super Admin", role: "super_admin", password: "admin123" },
    { id: "user_admin", username: "admin", displayName: "Admin", role: "super_admin", password: "admin123" },
    { id: "user_default_director", username: "director", displayName: "Default Director", role: "director", password: "director123" },
    { id: "user_default_office", username: "office", displayName: "Default Office User", role: "office_user", password: "office123" }
  ]) {
    await pool.execute(
      `INSERT INTO users (id, username, display_name, role, password_hash, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE username = username`,
      [user.id, user.username, user.displayName, user.role, hashPassword(user.password), 1, toMysqlDateTime(), toMysqlDateTime()]
    );
  }
}

async function seedDefaultMasterData(pool) {
  for (const line of DEFAULT_TEA_LINES) {
    await pool.execute(
      `INSERT INTO tea_lines (id, name, whole_line_bank_transfer, active)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [line.id, line.name, toBool(line.wholeLineBankTransfer), line.active === false ? 0 : 1]
    );
  }

  const lineNames = DEFAULT_TEA_LINES.map((line) => line.name);
  const placeholders = lineNames.map(() => "?").join(", ");
  const [lineRows] = await pool.query(`SELECT id, name FROM tea_lines WHERE name IN (${placeholders})`, lineNames);
  const lineIdsByName = new Map(lineRows.map((line) => [line.name, line.id]));

  for (const supplier of DEFAULT_SUPPLIERS) {
    const lineId = lineIdsByName.get(supplier.lineName);
    if (!lineId) continue;
    await pool.execute(
      `INSERT INTO suppliers (
        id, code, name, line_id, line_name, payment_mode, deduction_enabled,
        own_transport_addition_enabled, factory_transport_deduction_enabled,
        exclude_from_balance, active, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE id = id`,
      [
        supplier.id,
        supplier.code,
        supplier.name,
        lineId,
        supplier.lineName,
        paymentMode(supplier.paymentMode),
        toBool(supplier.deductionEnabled),
        toBool(supplier.ownTransportAdditionEnabled),
        toBool(supplier.factoryTransportDeductionEnabled),
        toBool(supplier.excludeFromBalance),
        supplier.active === false ? 0 : 1,
        toMysqlDateTime(DEFAULT_MASTER_DATA_UPDATED_AT)
      ]
    );
  }
}

function assertManagedRole(role) {
  if (!["director", "office_user"].includes(role)) {
    const error = new Error("role must be director or office_user");
    error.status = 400;
    throw error;
  }
}

export async function createMySqlStore(config = dbConfigFromEnv()) {
  await ensureDatabase(config);
  const pool = mysql.createPool({ ...config, timezone: "Z" });
  await executeSchema(pool);
  await seedDefaultUsers(pool);
  await seedDefaultMasterData(pool);

  async function upsertTeaLines(conn, records = []) {
    for (const record of records) {
      if (!record.id) {
        const error = new Error("Synced tea lines must include ids");
        error.status = 400;
        throw error;
      }
      await conn.execute(
        `INSERT INTO tea_lines (id, name, whole_line_bank_transfer, active)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           whole_line_bank_transfer = VALUES(whole_line_bank_transfer),
           active = VALUES(active)`,
        [record.id, record.name, toBool(record.wholeLineBankTransfer || record.whole_line_bank_transfer), record.active === false ? 0 : 1]
      );
    }
  }

  async function upsertSuppliers(conn, records = []) {
    for (const record of records) {
      if (!record.id) {
        const error = new Error("Synced records must include ids");
        error.status = 400;
        throw error;
      }
      await conn.execute(
        `INSERT INTO suppliers (
          id, code, name, line_id, line_name, payment_mode, deduction_enabled,
          own_transport_addition_enabled, factory_transport_deduction_enabled,
          exclude_from_balance, active, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          code = VALUES(code),
          name = VALUES(name),
          line_id = VALUES(line_id),
          line_name = VALUES(line_name),
          payment_mode = VALUES(payment_mode),
          deduction_enabled = VALUES(deduction_enabled),
          own_transport_addition_enabled = VALUES(own_transport_addition_enabled),
          factory_transport_deduction_enabled = VALUES(factory_transport_deduction_enabled),
          exclude_from_balance = VALUES(exclude_from_balance),
          active = VALUES(active),
          updated_at = VALUES(updated_at)`,
        [
          record.id,
          record.code || record.supplierCode || record.id,
          record.name || record.supplierName || "Unknown Supplier",
          record.lineId || null,
          record.lineName || "",
          paymentMode(record.paymentMode),
          toBool(record.deductionEnabled),
          toBool(record.ownTransportAdditionEnabled),
          toBool(record.factoryTransportDeductionEnabled),
          toBool(record.excludeFromBalance || record.exclude_from_balance),
          record.active === false ? 0 : 1,
          toMysqlDateTime(record.updatedAt)
        ]
      );
    }
  }

  async function upsertOfficeUsers(conn, records = []) {
    for (const record of records) {
      if (record?.role !== "office_user") continue;
      if (!record.id || !record.username || !record.displayName || !record.passwordHash) {
        const error = new Error("Synced office users must include id, username, displayName, and passwordHash");
        error.status = 400;
        throw error;
      }
      const [existingRows] = await conn.execute("SELECT role FROM users WHERE id = ? OR username = ? LIMIT 1", [
        record.id,
        record.username
      ]);
      if (existingRows[0] && existingRows[0].role !== "office_user") continue;
      const updatedAt = toMysqlDateTime(record.updatedAt || record.createdAt || new Date());
      await conn.execute(
        `INSERT INTO users (id, username, display_name, role, password_hash, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           username = IF(COALESCE(updated_at, created_at) <= VALUES(updated_at), VALUES(username), username),
           display_name = IF(COALESCE(updated_at, created_at) <= VALUES(updated_at), VALUES(display_name), display_name),
           password_hash = IF(COALESCE(updated_at, created_at) <= VALUES(updated_at), VALUES(password_hash), password_hash),
           active = IF(COALESCE(updated_at, created_at) <= VALUES(updated_at), VALUES(active), active),
           updated_at = IF(COALESCE(updated_at, created_at) <= VALUES(updated_at), VALUES(updated_at), updated_at)`,
        [
          record.id,
          record.username,
          record.displayName,
          "office_user",
          record.passwordHash,
          record.active === false ? 0 : 1,
          toMysqlDateTime(record.createdAt || record.updatedAt || new Date()),
          updatedAt
        ]
      );
    }
  }

  async function syncedOfficeUsers(conn) {
    const [rows] = await conn.execute(
      `SELECT id, username, display_name, role, password_hash, active, created_at, updated_at
       FROM users
       WHERE role = ?
       ORDER BY username`,
      ["office_user"]
    );
    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      passwordHash: row.password_hash,
      active: fromBool(row.active),
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at
    }));
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

  async function upsertSupplierPayments(conn, records = []) {
    for (const record of records) {
      if (!record.id) {
        const error = new Error("Synced records must include ids");
        error.status = 400;
        throw error;
      }
      await conn.execute(
        `INSERT INTO supplier_payments (
          id, supplier_id, month, line_name, scope, amount, balance_amount,
          paid_at, paid_by_office_user_id, paid_by_office_user_name, note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          month = VALUES(month),
          line_name = VALUES(line_name),
          scope = VALUES(scope),
          amount = VALUES(amount),
          balance_amount = VALUES(balance_amount),
          paid_at = VALUES(paid_at),
          paid_by_office_user_id = VALUES(paid_by_office_user_id),
          paid_by_office_user_name = VALUES(paid_by_office_user_name),
          note = VALUES(note)`,
        [
          record.id,
          record.supplierId || record.supplier_id,
          record.month,
          record.lineName || record.line_name || null,
          record.scope || "supplier",
          numberOrDefault(record.amount),
          numberOrDefault(record.balanceAmount ?? record.balance_amount),
          toMysqlDateTime(record.paidAt || record.paid_at),
          record.paidByOfficeUserId || record.paid_by_office_user_id || null,
          record.paidByOfficeUserName || record.paid_by_office_user_name || null,
          record.note || null
        ]
      );
    }
  }

  async function upsertMonthClosures(conn, records = []) {
    for (const record of records) {
      if (!record.id) {
        const error = new Error("Synced records must include ids");
        error.status = 400;
        throw error;
      }
      await conn.execute(
        `INSERT INTO month_closures (
          id, month, closed_at, closed_by_office_user_id, closed_by_office_user_name,
          reopened_at, reopened_by_office_user_id, reopened_by_office_user_name, note, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          closed_at = VALUES(closed_at),
          closed_by_office_user_id = VALUES(closed_by_office_user_id),
          closed_by_office_user_name = VALUES(closed_by_office_user_name),
          reopened_at = VALUES(reopened_at),
          reopened_by_office_user_id = VALUES(reopened_by_office_user_id),
          reopened_by_office_user_name = VALUES(reopened_by_office_user_name),
          note = VALUES(note),
          updated_at = VALUES(updated_at)`,
        [
          record.id,
          record.month,
          toMysqlDateTime(record.closedAt || record.closed_at),
          record.closedByOfficeUserId || record.closed_by_office_user_id || null,
          record.closedByOfficeUserName || record.closed_by_office_user_name || null,
          record.reopenedAt || record.reopened_at ? toMysqlDateTime(record.reopenedAt || record.reopened_at) : null,
          record.reopenedByOfficeUserId || record.reopened_by_office_user_id || null,
          record.reopenedByOfficeUserName || record.reopened_by_office_user_name || null,
          record.note || null,
          record.updatedAt || record.updated_at ? toMysqlDateTime(record.updatedAt || record.updated_at) : toMysqlDateTime()
        ]
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
        if (!fromBool(user.active)) {
          const error = new Error("User account is inactive");
          error.status = 403;
          throw error;
        }
        const token = randomBytes(24).toString("hex");
        await conn.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", [
          token,
          user.id,
          toMysqlDateTime()
        ]);
        await recordWebAudit(conn, user, {
          action: "login",
          entityType: "session",
          entityId: user.id,
          entityLabel: user.username,
          summary: `${user.display_name || user.username} logged in`
        });
        await conn.commit();
        return { token, user: publicUser(user) };
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async createUser(sessionToken, input) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const actor = await requireRole(conn, sessionToken, ["super_admin"]);
        assertManagedRole(input?.role);
        if (!input?.username || !input?.password || !input?.displayName) {
          const error = new Error("role, username, password, and displayName are required");
          error.status = 400;
          throw error;
        }
        const user = {
          id: makeId("user"),
          username: input.username,
          displayName: input.displayName,
          role: input.role,
          passwordHash: hashPassword(input.password),
          active: true,
          createdAt: toMysqlDateTime(),
          updatedAt: toMysqlDateTime()
        };
        await conn.execute(
          `INSERT INTO users (id, username, display_name, role, password_hash, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [user.id, user.username, user.displayName, user.role, user.passwordHash, 1, user.createdAt, user.updatedAt]
        );
        await recordWebAudit(conn, actor, {
          action: "create",
          entityType: "user",
          entityId: user.id,
          entityLabel: user.username,
          summary: `Created ${user.role} user ${user.username}`,
          after: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            active: user.active,
            createdAt: user.createdAt
          }
        });
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

    async createDirector(sessionToken, input) {
      return this.createUser(sessionToken, { ...input, role: "director" });
    },

    async listUsers(sessionToken, role) {
      assertManagedRole(role);
      const conn = await pool.getConnection();
      try {
        await requireRole(conn, sessionToken, role === "office_user" ? ["super_admin", "director", "office_user"] : ["super_admin", "director"]);
        const [rows] = await conn.execute(
          "SELECT * FROM users WHERE role = ? ORDER BY display_name ASC",
          [role]
        );
        return rows.map(publicUser);
      } finally {
        conn.release();
      }
    },

    async listDirectors(sessionToken) {
      return this.listUsers(sessionToken, "director");
    },

    async updateUser(sessionToken, userId, input) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const actor = await requireRole(conn, sessionToken, ["super_admin"]);
        const [rows] = await conn.execute(
          "SELECT * FROM users WHERE id = ? AND role IN (?, ?)",
          [userId, "director", "office_user"]
        );
        if (!rows[0]) {
          const error = new Error("Managed user not found");
          error.status = 404;
          throw error;
        }

        const current = rows[0];
        const before = publicUser(current);
        const nextUsername = input.username || current.username;
        const nextDisplayName = input.displayName || current.display_name;
        const nextActive = typeof input.active === "boolean" ? toBool(input.active) : current.active;
        const nextPasswordHash = input.password ? hashPassword(input.password) : current.password_hash;
        const nextUpdatedAt = toMysqlDateTime();

        await conn.execute(
          `UPDATE users
           SET username = ?, display_name = ?, active = ?, password_hash = ?, updated_at = ?
           WHERE id = ?`,
          [nextUsername, nextDisplayName, nextActive, nextPasswordHash, nextUpdatedAt, userId]
        );
        const [updatedRows] = await conn.execute("SELECT * FROM users WHERE id = ?", [userId]);
        const after = publicUser(updatedRows[0]);
        await recordWebAudit(conn, actor, {
          action: "update",
          entityType: "user",
          entityId: userId,
          entityLabel: after.username,
          summary: `Updated ${after.role} user ${after.username}`,
          before,
          after
        });
        await conn.commit();
        return after;
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
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.execute(
          `SELECT users.*
           FROM sessions
           INNER JOIN users ON users.id = sessions.user_id
           WHERE sessions.token = ?`,
          [sessionToken]
        );
        await conn.execute("DELETE FROM sessions WHERE token = ?", [sessionToken]);
        if (rows[0]) {
          await recordWebAudit(conn, rows[0], {
            action: "logout",
            entityType: "session",
            entityId: rows[0].id,
            entityLabel: rows[0].username,
            summary: `${rows[0].display_name || rows[0].username} logged out`
          });
        }
        await conn.commit();
        return { ok: true };
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async getCurrentUser(sessionToken) {
      const conn = await pool.getConnection();
      try {
        return publicUser(await requireRole(conn, sessionToken, ["super_admin", "office_user", "director"]));
      } finally {
        conn.release();
      }
    },

    async syncFromDesktopPayload(payload, actorId, source = "desktop") {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await upsertOfficeUsers(conn, payload.officeUsers);
        await upsertTeaLines(conn, payload.teaLines);
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
        await upsertSupplierPayments(conn, payload.supplierPayments);
        await upsertMonthClosures(conn, payload.monthClosures);
        await upsertMoneyRows(conn, "arrears_ledger", payload.arrears, [
          ["supplier_id", (item) => item.supplierId || item.supplier_id],
          ["effective_month", (item) => item.effectiveMonth || item.effective_month],
          ["amount", (item) => numberOrDefault(item.amount)],
          ["note", (item) => item.note || null]
        ]);

        const result = {
          id: makeId("sync"),
          userId: actorId,
          syncedAt: toMysqlDateTime(),
          counts: {
            suppliers: payload.suppliers?.length || 0,
            teaLines: payload.teaLines?.length || 0,
            collectionEntries: payload.collectionEntries?.length || 0,
            officeUsers: payload.officeUsers?.length || 0,
            advances: payload.advances?.length || 0,
            fertilizerInstallments: payload.fertilizerInstallments?.length || 0,
            teaPackets: payload.teaPackets?.length || 0,
            supplierPayments: payload.supplierPayments?.length || 0,
            supplierMonthOverrides: payload.supplierMonthOverrides?.length || 0,
            arrears: payload.arrears?.length || 0,
            monthClosures: payload.monthClosures?.length || 0
          }
        };
        await conn.execute(
          "INSERT INTO sync_log (id, source, synced_at, summary_json) VALUES (?, ?, ?, ?)",
          [result.id, source, result.syncedAt, JSON.stringify(result.counts)]
        );
        result.officeUsers = await syncedOfficeUsers(conn);
        await conn.commit();
        return result;
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async syncFromDesktop(sessionToken, payload) {
      const conn = await pool.getConnection();
      try {
        const user = await requireRole(conn, sessionToken, ["super_admin", "office_user"]);
        return await this.syncFromDesktopPayload(payload, user.id, "desktop");
      } finally {
        conn.release();
      }
    },

    async syncFromTrustedDesktop(payload) {
      return await this.syncFromDesktopPayload(payload, "trusted_desktop_sync", "trusted_desktop");
    },

    async getGreenLeafInput(sessionToken, month) {
      const conn = await pool.getConnection();
      try {
        await requireRole(conn, sessionToken, ["super_admin", "office_user", "director"]);
        month = normalizeMonth(month);
        const previousMonth = previousMonthValue(month);
        const [teaLines] = await conn.execute("SELECT * FROM tea_lines WHERE active = TRUE ORDER BY name");
        const [suppliers] = await conn.execute("SELECT * FROM suppliers WHERE active = TRUE ORDER BY code");
        const [entries] = await conn.execute("SELECT * FROM collection_entries WHERE collection_date >= ?", [`${previousMonth}-01`]);
        const [settingsRows] = await conn.execute("SELECT * FROM monthly_settings");
        const [overrides] = await conn.execute("SELECT * FROM supplier_month_overrides");
        const [advances] = await conn.execute("SELECT * FROM advances");
        const [fertilizerInstallments] = await conn.execute("SELECT * FROM fertilizer_installments");
        const [teaPackets] = await conn.execute("SELECT * FROM tea_packets");
        const [supplierPayments] = await conn.execute("SELECT * FROM supplier_payments");
        const [arrears] = await conn.execute("SELECT * FROM arrears_ledger");
        const [monthClosures] = await conn.execute("SELECT * FROM month_closures");

        return {
          month,
          teaLines: teaLines.map((row) => ({
            id: row.id,
            name: row.name,
            wholeLineBankTransfer: fromBool(row.whole_line_bank_transfer),
            active: fromBool(row.active)
          })),
          suppliers: suppliers.map((row) => ({
            id: row.id,
            code: row.code,
            name: row.name,
            lineId: row.line_id,
            lineName: row.line_name,
            paymentMode: paymentMode(row.payment_mode),
            deductionEnabled: fromBool(row.deduction_enabled),
            ownTransportAdditionEnabled: fromBool(row.own_transport_addition_enabled),
            factoryTransportDeductionEnabled: fromBool(row.factory_transport_deduction_enabled),
            excludeFromBalance: fromBool(row.exclude_from_balance)
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
          monthlySettings: settingsRows.map((settings) => ({
            month: settings.month,
            teaPricePerKg: numberOrDefault(settings.tea_price_per_kg),
            deductionPercent: numberOrDefault(settings.deduction_percent),
            ownTransportAdditionPerKg: numberOrDefault(settings.own_transport_addition_per_kg),
            factoryTransportDeductionPerKg: numberOrDefault(settings.factory_transport_deduction_per_kg)
          })),
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
          supplierPayments: supplierPayments.map((row) => ({
            id: row.id,
            supplierId: row.supplier_id,
            month: row.month,
            lineName: row.line_name,
            scope: row.scope,
            amount: numberOrDefault(row.amount),
            balanceAmount: numberOrDefault(row.balance_amount),
            paidAt: row.paid_at,
            paidByOfficeUserId: row.paid_by_office_user_id,
            paidByOfficeUserName: row.paid_by_office_user_name,
            note: row.note
          })),
          arrears: arrears.map((row) => ({
            id: row.id,
            supplierId: row.supplier_id,
            effectiveMonth: row.effective_month,
            amount: numberOrDefault(row.amount),
            note: row.note
          })),
          monthClosures: monthClosures.map((row) => ({
            id: row.id,
            month: row.month,
            closedAt: row.closed_at,
            closedByOfficeUserId: row.closed_by_office_user_id,
            closedByOfficeUserName: row.closed_by_office_user_name,
            reopenedAt: row.reopened_at || undefined,
            reopenedByOfficeUserId: row.reopened_by_office_user_id,
            reopenedByOfficeUserName: row.reopened_by_office_user_name,
            note: row.note,
            updatedAt: row.updated_at,
            closed: !row.reopened_at
          }))
        };
      } finally {
        conn.release();
      }
    },

    async getBalances(sessionToken, month) {
      month = normalizeMonth(month);
      const input = await this.getGreenLeafInput(sessionToken, month);
      const conn = await pool.getConnection();
      try {
        const [signalRows] = await conn.execute("SELECT * FROM balance_transfer_signals WHERE month = ?", [month]);
        const [factoryRows] = await conn.execute("SELECT * FROM factory_officer_transfer_signals WHERE month = ?", [month]);
        return buildBalances(input, signalRows.map(mapBalanceSignal), factoryRows.map(mapFactoryOfficerSignal));
      } finally {
        conn.release();
      }
    },

    async listAdvanceSignals(sessionToken) {
      const conn = await pool.getConnection();
      try {
        await requireRole(conn, sessionToken, ["super_admin", "office_user", "director"]);
        const [suppliers] = await conn.execute(
          `SELECT id, code, name, line_id, line_name
           FROM suppliers
           WHERE active = TRUE
           ORDER BY code`
        );
        const [teaLines] = await conn.execute(
          `SELECT id, name
           FROM tea_lines
           WHERE active = TRUE
           ORDER BY name`
        );
        const [signals] = await conn.execute("SELECT * FROM advance_signals ORDER BY marked_at DESC, id DESC");
        return {
          suppliers: suppliers.map((row) => ({
            id: row.id,
            code: row.code,
            name: row.name,
            lineId: row.line_id,
            lineName: row.line_name
          })),
          teaLines: teaLines.map((row) => ({
            id: row.id,
            name: row.name
          })),
          signals: signals.map(mapAdvanceSignal)
        };
      } finally {
        conn.release();
      }
    },

    async getAdvanceSuggestion(sessionToken, input) {
      const month = normalizeMonth(input.month);
      const calculationInput = await this.getGreenLeafInput(sessionToken, month);
      return buildAdvanceSuggestion(calculationInput, input.scope === "line" ? "line" : "supplier", input.targetId);
    },

    async createAdvanceSignal(sessionToken, input) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const user = await requireRole(conn, sessionToken, ["super_admin", "director"]);
        const effectiveMonth = normalizeMonth(input.effectiveMonth);
        const scope = input.scope === "line" ? "line" : "supplier";
        const targetId = String(input.targetId || "").trim();
        const amount = money(input.amount);
        if (!targetId || !input.dateGiven || amount <= 0) {
          const error = new Error("scope, target, effectiveMonth, dateGiven, and amount are required");
          error.status = 400;
          throw error;
        }
        const calculationInput = await this.getGreenLeafInput(sessionToken, effectiveMonth);
        const suggestion = buildAdvanceSuggestion(calculationInput, scope, targetId);
        const signal = {
          id: makeId("advance_signal"),
          scope,
          targetId: suggestion.targetId,
          targetLabel: suggestion.targetLabel,
          effectiveMonth,
          dateGiven: toDateOnly(input.dateGiven),
          suggestedAmount: money(suggestion.suggestedAmount),
          amount,
          breakdown: suggestion.breakdown,
          comment: input.comment || "",
          markedAt: toMysqlDateTime(),
          markedByUserId: user.id,
          markedByDisplayName: user.display_name || user.username
        };
        await conn.execute(
          `INSERT INTO advance_signals
           (id, scope, target_id, target_label, effective_month, date_given, suggested_amount,
            amount, breakdown_json, comment, marked_at, marked_by_user_id, marked_by_display_name,
            read_at, read_by_user_id, read_by_display_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
          [
            signal.id,
            signal.scope,
            signal.targetId,
            signal.targetLabel,
            signal.effectiveMonth,
            signal.dateGiven,
            signal.suggestedAmount,
            signal.amount,
            JSON.stringify(signal.breakdown || []),
            signal.comment,
            signal.markedAt,
            signal.markedByUserId,
            signal.markedByDisplayName
          ]
        );
        await recordWebAudit(conn, user, {
          action: "create",
          entityType: "advance_signal",
          entityId: signal.id,
          entityLabel: signal.targetLabel,
          summary: `Created advance signal for ${signal.targetLabel}`,
          after: signal
        });
        await conn.commit();
        return signal;
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async updateAdvanceSignal(sessionToken, signalId, input) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const user = await requireRole(conn, sessionToken, ["super_admin", "director"]);
        const [existingRows] = await conn.execute("SELECT * FROM advance_signals WHERE id = ?", [signalId]);
        const existing = existingRows[0] ? mapAdvanceSignal(existingRows[0]) : null;
        assertCanChangeSignal(existing, { ...user, displayName: user.display_name });
        const effectiveMonth = normalizeMonth(input.effectiveMonth || existing.effectiveMonth);
        const amount = money(input.amount ?? existing.amount);
        if (amount <= 0) {
          const error = new Error("amount must be greater than zero");
          error.status = 400;
          throw error;
        }
        const calculationInput = await this.getGreenLeafInput(sessionToken, effectiveMonth);
        const suggestion = buildAdvanceSuggestion(calculationInput, existing.scope, existing.targetId);
        const updated = {
          ...existing,
          effectiveMonth,
          dateGiven: toDateOnly(input.dateGiven || existing.dateGiven),
          suggestedAmount: money(suggestion.suggestedAmount),
          amount,
          breakdown: suggestion.breakdown,
          comment: input.comment ?? existing.comment,
          readAt: null,
          readByUserId: null,
          readByDisplayName: null
        };
        await conn.execute(
          `UPDATE advance_signals
           SET effective_month = ?, date_given = ?, suggested_amount = ?, amount = ?,
               breakdown_json = ?, comment = ?, read_at = NULL, read_by_user_id = NULL,
               read_by_display_name = NULL
           WHERE id = ?`,
          [
            updated.effectiveMonth,
            updated.dateGiven,
            updated.suggestedAmount,
            updated.amount,
            JSON.stringify(updated.breakdown || []),
            updated.comment,
            signalId
          ]
        );
        await recordWebAudit(conn, user, {
          action: "update",
          entityType: "advance_signal",
          entityId: signalId,
          entityLabel: updated.targetLabel,
          summary: `Updated advance signal for ${updated.targetLabel}`,
          before: existing,
          after: updated
        });
        await conn.commit();
        return updated;
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async deleteAdvanceSignal(sessionToken, signalId) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const user = await requireRole(conn, sessionToken, ["super_admin", "director"]);
        const [existingRows] = await conn.execute("SELECT * FROM advance_signals WHERE id = ?", [signalId]);
        const existing = existingRows[0] ? mapAdvanceSignal(existingRows[0]) : null;
        assertCanChangeSignal(existing, { ...user, displayName: user.display_name });
        await conn.execute("DELETE FROM advance_signals WHERE id = ?", [signalId]);
        await recordWebAudit(conn, user, {
          action: "delete",
          entityType: "advance_signal",
          entityId: signalId,
          entityLabel: existing.targetLabel,
          summary: `Deleted advance signal for ${existing.targetLabel}`,
          before: existing
        });
        await conn.commit();
        return { ok: true };
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async markBalancePaid(sessionToken, input) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const user = await requireRole(conn, sessionToken, ["super_admin", "director"]);
        const month = normalizeMonth(input.month);
        const section = input.section === "supplier" ? "supplier" : "line";
        const targetId = String(input.targetId || "").trim();
        if (!targetId) {
          const error = new Error("targetId is required");
          error.status = 400;
          throw error;
        }
        const [existingRows] = await conn.execute(
          "SELECT * FROM balance_transfer_signals WHERE month = ? AND section = ? AND target_id = ?",
          [month, section, targetId]
        );
        const existing = existingRows[0] ? mapBalanceSignal(existingRows[0]) : null;
        if (existing) assertCanChangeSignal(existing, { ...user, displayName: user.display_name });
        const signal = {
          id: existing?.id || makeId("balance_signal"),
          month,
          section,
          targetId,
          targetLabel: input.targetLabel || "",
          amount: money(input.amount),
          paymentDoneDate: toDateOnly(input.paymentDoneDate || existing?.paymentDoneDate || new Date()),
          comment: input.comment || "",
          markedAt: existing?.markedAt || toMysqlDateTime(),
          markedByUserId: existing?.markedByUserId || user.id,
          markedByDisplayName: existing?.markedByDisplayName || user.display_name || user.username
        };
        await conn.execute(
          `INSERT INTO balance_transfer_signals
           (id, month, section, target_id, target_label, amount, payment_done_date, comment, marked_at, marked_by_user_id, marked_by_display_name,
            read_at, read_by_user_id, read_by_display_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
           ON DUPLICATE KEY UPDATE
              target_label = VALUES(target_label),
              amount = VALUES(amount),
              payment_done_date = VALUES(payment_done_date),
              comment = VALUES(comment),
              read_at = NULL,
              read_by_user_id = NULL,
              read_by_display_name = NULL`,
          [
            signal.id,
            signal.month,
            signal.section,
            signal.targetId,
            signal.targetLabel,
            signal.amount,
            signal.paymentDoneDate,
            signal.comment,
            signal.markedAt,
            signal.markedByUserId,
            signal.markedByDisplayName
          ]
        );
        const [updatedRows] = await conn.execute(
          "SELECT * FROM balance_transfer_signals WHERE month = ? AND section = ? AND target_id = ?",
          [month, section, targetId]
        );
        const updated = mapBalanceSignal(updatedRows[0]);
        await recordWebAudit(conn, user, {
          action: existing ? "update" : "create",
          entityType: "balance_signal",
          entityId: updated.id,
          entityLabel: updated.targetLabel,
          summary: `${existing ? "Updated" : "Created"} ${section} balance signal for ${updated.targetLabel || targetId}`,
          before: existing,
          after: updated
        });
        await conn.commit();
        return updated;
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async deleteBalanceSignal(sessionToken, signalId) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const user = await requireRole(conn, sessionToken, ["super_admin", "director"]);
        const [existingRows] = await conn.execute("SELECT * FROM balance_transfer_signals WHERE id = ?", [signalId]);
        const existing = existingRows[0] ? mapBalanceSignal(existingRows[0]) : null;
        assertCanChangeSignal(existing, { ...user, displayName: user.display_name });
        await conn.execute("DELETE FROM balance_transfer_signals WHERE id = ?", [signalId]);
        await recordWebAudit(conn, user, {
          action: "delete",
          entityType: "balance_signal",
          entityId: signalId,
          entityLabel: existing.targetLabel,
          summary: `Deleted ${existing.section} balance signal for ${existing.targetLabel || existing.targetId}`,
          before: existing
        });
        await conn.commit();
        return { ok: true };
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async addFactoryOfficerTransfer(sessionToken, input) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const user = await requireRole(conn, sessionToken, ["super_admin", "director"]);
        const amount = money(input.amount);
        if (amount <= 0) {
          const error = new Error("amount must be greater than zero");
          error.status = 400;
          throw error;
        }
        const signal = {
          id: makeId("factory_transfer"),
          month: normalizeMonth(input.month),
          amount,
          paymentDoneDate: toDateOnly(input.paymentDoneDate || new Date()),
          comment: input.comment || "",
          markedAt: toMysqlDateTime(),
          markedByUserId: user.id,
          markedByDisplayName: user.display_name || user.username
        };
        await conn.execute(
          `INSERT INTO factory_officer_transfer_signals
           (id, month, amount, payment_done_date, comment, marked_at, marked_by_user_id, marked_by_display_name,
            read_at, read_by_user_id, read_by_display_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
          [
            signal.id,
            signal.month,
            signal.amount,
            signal.paymentDoneDate,
            signal.comment,
            signal.markedAt,
            signal.markedByUserId,
            signal.markedByDisplayName
          ]
        );
        await recordWebAudit(conn, user, {
          action: "create",
          entityType: "factory_transfer_signal",
          entityId: signal.id,
          entityLabel: signal.month,
          summary: `Created factory officer transfer signal for ${signal.month}`,
          after: signal
        });
        await conn.commit();
        return signal;
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async updateFactoryOfficerTransfer(sessionToken, signalId, input) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const user = await requireRole(conn, sessionToken, ["super_admin", "director"]);
        const [existingRows] = await conn.execute("SELECT * FROM factory_officer_transfer_signals WHERE id = ?", [signalId]);
        const existing = existingRows[0] ? mapFactoryOfficerSignal(existingRows[0]) : null;
        assertCanChangeSignal(existing, { ...user, displayName: user.display_name });
        const amount = money(input.amount ?? existing.amount);
        if (amount <= 0) {
          const error = new Error("amount must be greater than zero");
          error.status = 400;
          throw error;
        }
        const updated = {
          ...existing,
          amount,
          paymentDoneDate: toDateOnly(input.paymentDoneDate || existing.paymentDoneDate || new Date()),
          comment: input.comment ?? existing.comment,
          readAt: null,
          readByUserId: null,
          readByDisplayName: null
        };
        await conn.execute(
          `UPDATE factory_officer_transfer_signals
           SET amount = ?, payment_done_date = ?, comment = ?, read_at = NULL, read_by_user_id = NULL,
               read_by_display_name = NULL
           WHERE id = ?`,
          [updated.amount, updated.paymentDoneDate, updated.comment, signalId]
        );
        await recordWebAudit(conn, user, {
          action: "update",
          entityType: "factory_transfer_signal",
          entityId: signalId,
          entityLabel: updated.month,
          summary: `Updated factory officer transfer signal for ${updated.month}`,
          before: existing,
          after: updated
        });
        await conn.commit();
        return updated;
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async deleteFactoryOfficerTransfer(sessionToken, signalId) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const user = await requireRole(conn, sessionToken, ["super_admin", "director"]);
        const [existingRows] = await conn.execute("SELECT * FROM factory_officer_transfer_signals WHERE id = ?", [signalId]);
        const existing = existingRows[0] ? mapFactoryOfficerSignal(existingRows[0]) : null;
        assertCanChangeSignal(existing, { ...user, displayName: user.display_name });
        await conn.execute("DELETE FROM factory_officer_transfer_signals WHERE id = ?", [signalId]);
        await recordWebAudit(conn, user, {
          action: "delete",
          entityType: "factory_transfer_signal",
          entityId: signalId,
          entityLabel: existing.month,
          summary: `Deleted factory officer transfer signal for ${existing.month}`,
          before: existing
        });
        await conn.commit();
        return { ok: true };
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async markSignalRead(sessionToken, input) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const user = await requireRole(conn, sessionToken, ["super_admin", "office_user"]);
        const type = String(input.type || "").trim();
        const id = String(input.id || "").trim();
        if (!id) {
          const error = new Error("Signal id is required");
          error.status = 400;
          throw error;
        }
        const table =
          type === "advance"
            ? "advance_signals"
            : type === "balance"
              ? "balance_transfer_signals"
              : type === "factory"
                ? "factory_officer_transfer_signals"
                : "";
        if (!table) {
          const error = new Error("Signal type must be advance, balance, or factory");
          error.status = 400;
          throw error;
        }
        const readAt = toMysqlDateTime();
        const [result] = await conn.execute(
          `UPDATE ${table}
           SET read_at = ?, read_by_user_id = ?, read_by_display_name = ?
           WHERE id = ?`,
          [readAt, user.id, user.display_name || user.username, id]
        );
        if (!result.affectedRows) {
          const error = new Error("Signal not found");
          error.status = 404;
          throw error;
        }
        const [rows] = await conn.execute(`SELECT * FROM ${table} WHERE id = ?`, [id]);
        let updated;
        let entityType;
        let entityLabel;
        if (type === "advance") {
          updated = mapAdvanceSignal(rows[0]);
          entityType = "advance_signal";
          entityLabel = updated.targetLabel;
        } else if (type === "balance") {
          updated = mapBalanceSignal(rows[0]);
          entityType = "balance_signal";
          entityLabel = updated.targetLabel;
        } else {
          updated = mapFactoryOfficerSignal(rows[0]);
          entityType = "factory_transfer_signal";
          entityLabel = updated.month;
        }
        await recordWebAudit(conn, user, {
          action: "mark_read",
          entityType,
          entityId: id,
          entityLabel,
          summary: `Marked ${type} signal as read`,
          after: updated
        });
        await conn.commit();
        return updated;
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async listWebAuditLogs(sessionToken) {
      const conn = await pool.getConnection();
      try {
        await requireRole(conn, sessionToken, ["super_admin"]);
        const [rows] = await conn.execute(
          `SELECT *
           FROM web_audit_log
           ORDER BY created_at DESC, id DESC
           LIMIT 500`
        );
        return rows.map(mapWebAuditLog);
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
