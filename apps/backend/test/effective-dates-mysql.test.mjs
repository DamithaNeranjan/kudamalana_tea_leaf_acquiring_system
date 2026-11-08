import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";
import { createMySqlStore, loadBackendEnv } from "../src/mysqlStore.mjs";
import { buildGreenLeafBookWithAutoArrears } from "../../../packages/shared/src/index.mjs";

test("MySQL migrates legacy dates, syncs both dates and queries by effective month", {
  skip: process.env.TEA_TEST_MYSQL !== "1" ? "Set TEA_TEST_MYSQL=1 to run against an isolated MySQL database" : false
}, async () => {
  await loadBackendEnv();
  // Never connect to or modify the configured application database.
  const database = `tea_effective_dates_test_${randomBytes(6).toString("hex")}`;
  const config = {
    host: process.env.MYSQL_HOST || "127.0.0.1", port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root", password: process.env.MYSQL_PASSWORD,
    connectTimeout: 5000, timezone: "Z"
  };
  const connection = await mysql.createConnection(config);
  let store;
  try {
    await connection.query(`CREATE DATABASE \`${database}\``);
    await connection.changeUser({ database });
    const schema = (await readFile(new URL("../src/mysql-schema.sql", import.meta.url), "utf8"))
      .replace(/\s*effective_date DATE NOT NULL,/g, "");
    for (const statement of schema.split(/;\s*(?:\r?\n|$)/).map((item) => item.trim()).filter(Boolean)) {
      await connection.query(statement);
    }
    await connection.execute("INSERT INTO suppliers (id, code, name, line_name, updated_at) VALUES ('date_supplier', 'DATE', 'Date supplier', 'North', '2026-12-31')");
    await connection.execute(`INSERT INTO collection_entries
      (id, supplier_id, supplier_code, supplier_name, line_name, collection_date, bag_count,
       original_gross_weight_kg, gross_weight_kg, net_weight_kg, line_user_name, print_status, posted_at)
      VALUES ('legacy_date', 'date_supplier', 'DATE', 'Date supplier', 'North', '2026-12-31', 1, 20, 20, 20, 'Collector', 'printed', '2027-01-01')`);
    store = await createMySqlStore({ ...config, database });
    let [rows] = await connection.execute("SELECT collection_date, effective_date FROM collection_entries WHERE id = 'legacy_date'");
    assert.equal(rows[0].effective_date.getFullYear(), 2026);
    const login = await store.login("office", "office123");
    await store.syncFromDesktopPayload({ collectionEntries: [{
      id: "legacy_date", supplierId: "date_supplier", supplierCode: "DATE", supplierName: "Date supplier", lineName: "North",
      collectionDate: "2026-12-31", effectiveDate: "2027-03-01", netWeightKg: 20, postedAt: "2027-03-01T00:00:00Z"
    }] }, "date_test");
    const input = await store.getGreenLeafInput(login.token, "2027-03");
    assert.equal(input.entries[0].collectionDate, "2026-12-31");
    assert.equal(input.entries[0].effectiveDate, "2027-03-01");
    const book = buildGreenLeafBookWithAutoArrears(input);
    assert.equal(book.rows.find((row) => row.supplierId === "date_supplier").dailyKg[0], 20);
    await store.close();
    store = await createMySqlStore({ ...config, database });
    [rows] = await connection.execute("SELECT effective_date FROM collection_entries WHERE id = 'legacy_date'");
    assert.equal(rows[0].effective_date.getMonth(), 2);
    const [indexes] = await connection.query("SHOW INDEX FROM collection_entries WHERE Key_name = 'idx_collection_entries_effective_supplier'");
    assert.equal(indexes.length, 2);
    await store.syncFromDesktopPayload({ collectionEntries: [{
      id: "old_client", supplierId: "date_supplier", collectionDate: "2027-04-01", netWeightKg: 5
    }] }, "date_test");
    const [legacy] = await connection.query("SELECT effective_date = collection_date AS same_date FROM collection_entries WHERE id = 'old_client'");
    assert.equal(legacy[0].same_date, 1);
  } finally {
    await store?.close();
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await connection.end();
  }
});
