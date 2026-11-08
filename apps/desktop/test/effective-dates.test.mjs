import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { LocalStore } from "../src/localStore.mjs";
import { StagingEdits } from "../renderer/modules/stagingEdits.js";
import { bulkStagingRows, collectionRecordRows, stagingRows } from "../renderer/modules/records.js";
import { buildGreenLeafBook, suggestAdvancePayment, validateEffectiveDate } from "../../../packages/shared/src/index.mjs";

function mobileRecord(index = 0) {
  return {
    id: `mobile_date_${index}`, supplierId: "sup_date", supplierCode: "DATE", supplierName: "Date supplier",
    lineName: index % 2 ? "North" : "South", collectionDate: "2026-12-31", collectionTime: "08:30",
    bagCount: 2, grossWeightKg: 50, netWeightKg: 40, lineUserName: "Collector", printStatus: "printed"
  };
}

async function withStore(fn) {
  const dir = await mkdtemp(join(tmpdir(), "tea-effective-dates-"));
  const store = new LocalStore(join(dir, "test.sqlite"));
  try {
    await store.load();
    await fn(store);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("effective dates preserve mobile reference, closed-month imports, posting and restart", async () => {
  await withStore(async (store) => {
    store.db.prepare("INSERT INTO month_closures (id, month, closed_at, updated_at) VALUES (?, ?, ?, ?)")
      .run("closed_dec", "2026-12", "2027-01-01", "2027-01-01");
    const result = await store.importCollections("tablet", [mobileRecord()]);
    const id = result.imported[0];
    assert.equal(store.stagingById(id).effectiveDate, "2026-12-31");
    await assert.rejects(store.postStaging(id), { status: 409 });
    await store.updateStaging(id, { effectiveDate: "2027-01-01", collectionDate: "2027-02-01", netWeightKg: 39 });
    store.close();
    await store.load();
    const staged = store.stagingById(id);
    assert.equal(staged.collectionDate, "2026-12-31");
    assert.equal(staged.effectiveDate, "2027-01-01");
    const entry = await store.postStaging(id, { id: "office", displayName: "Office user" });
    assert.equal(entry.effectiveDate, "2027-01-01");
    assert.equal(entry.collectionDate, "2026-12-31");
    assert.equal(entry.netWeightKg, 39);
    assert.equal(store.monthEndSummary("2026-12").supplierBills.some((row) => row.supplierId === "sup_date"), false);
    const bill = store.monthEndSummary("2027-01").supplierBills.find((row) => row.supplierId === "sup_date");
    assert.equal(bill.collectionEntries[0].id, entry.id);
    assert.equal(store.greenLeafBook("2026-12").rows.some((row) => row.supplierId === "sup_date"), false);
    assert.equal(store.greenLeafBook("2027-01").rows.find((row) => row.supplierId === "sup_date").dailyKg[0], 39);
    assert.equal(store.exportForCloud().collectionEntries[0].effectiveDate, "2027-01-01");
    assert.deepEqual((await store.importCollections("tablet", [mobileRecord()])).skipped, [mobileRecord().id]);
    store.close();
    await store.load();
    assert.equal(store.collectionEntries()[0].effectiveDate, "2027-01-01");
  });
});

test("bulk date changes span all pages, preserve weights and roll back on missing targets or SQL failure", async () => {
  await withStore(async (store) => {
    await store.importCollections("tablet", Array.from({ length: 250 }, (_, index) => mobileRecord(index)));
    const rows = store.collectionStaging();
    const filtered = bulkStagingRows(rows, { stagingLine: "north" }, "filtered");
    assert.equal(filtered.length, 125);
    assert.equal(bulkStagingRows(rows, { stagingLine: "north" }, "all").length, 250);
    assert.deepEqual(await store.updateStagingEffectiveDate({ ids: filtered.map((row) => row.id), effectiveDate: "2027-01-01" }), { updatedCount: 125 });
    assert.equal(store.collectionStaging().filter((row) => row.effectiveDate === "2027-01-01").length, 125);
    const ids = rows.map((row) => row.id);
    store.db.prepare("INSERT INTO month_closures (id, month, closed_at, updated_at) VALUES (?, ?, ?, ?)")
      .run("closed_feb", "2027-02", "2027-03-01", "2027-03-01");
    await assert.rejects(store.updateStagingEffectiveDate({ ids, effectiveDate: "2027-02-01" }), { status: 409 });
    await assert.rejects(store.updateStaging(ids[0], { effectiveDate: "2027-02-01" }), { status: 409 });
    store.db.prepare("DELETE FROM month_closures WHERE id = 'closed_feb'").run();
    await assert.rejects(store.updateStagingEffectiveDate({ ids: [...ids, "missing"], effectiveDate: "2027-02-01" }), { status: 404 });
    assert.equal(store.stagingById(ids[0]).effectiveDate, rows[0].effectiveDate);
    store.db.exec(`CREATE TRIGGER fail_date BEFORE UPDATE ON collection_staging WHEN NEW.id = '${ids[1]}' BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
    await assert.rejects(store.updateStagingEffectiveDate({ ids, effectiveDate: "2027-02-01" }), /test failure/);
    assert.equal(store.stagingById(ids[0]).effectiveDate, rows[0].effectiveDate);
    store.db.exec("DROP TRIGGER fail_date");
    assert.deepEqual(await store.updateStagingEffectiveDate({ ids: [...ids, ids[0]], effectiveDate: "2028-02-29" }), { updatedCount: 250 });
    for (const row of store.collectionStaging()) {
      assert.equal(row.collectionDate, "2026-12-31");
      assert.equal(row.effectiveDate, "2028-02-29");
      assert.equal(row.netWeightKg, 40);
      assert.equal(row.grossWeightKg, 50);
    }
    await store.importCollections("tablet", [mobileRecord(999)]);
    assert.equal(store.collectionStaging().find((row) => row.mobileRecordId === "mobile_date_999").effectiveDate, "2026-12-31");
    await assert.rejects(store.updateStagingEffectiveDate({ ids: [], effectiveDate: "2027-01-01" }), { status: 400 });
    for (const effectiveDate of ["", null, "2027-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "2026-1-01", "2026-01-01T00:00:00Z"]) {
      await assert.rejects(store.updateStaging(ids[0], { effectiveDate }), { status: 400 });
      await assert.rejects(store.updateStagingEffectiveDate({ ids, effectiveDate }), { status: 400 });
    }
  });
});

test("legacy SQLite staging and entries migrate once without overwriting office dates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tea-date-migration-"));
  const filePath = join(dir, "legacy.sqlite");
  const db = new DatabaseSync(filePath);
  const schema = await readFile(new URL("../src/sqlite-schema.sql", import.meta.url), "utf8");
  db.exec(schema.replaceAll(/\s*effective_date TEXT NOT NULL,/g, ""));
  const columns = "id, mobile_record_id, supplier_id, supplier_code, supplier_name, line_name, collection_date, bag_count, original_gross_weight_kg, gross_weight_kg, net_weight_kg, line_user_name, print_status";
  const values = ["legacy", "mobile_legacy", "sup_legacy", "L1", "Legacy", "North", "2026-12-31", 1, 10, 10, 9, "Collector", "printed"];
  db.prepare(`INSERT INTO collection_entries (${columns}, posted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(...values, "2027-01-01");
  db.prepare(`INSERT INTO collection_staging (${columns}, device_id, imported_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(...values, "tablet", "2027-01-01", "pending_review");
  db.close();
  const store = new LocalStore(filePath);
  try {
    await store.load();
    assert.equal(store.collectionEntries()[0].effectiveDate, "2026-12-31");
    assert.equal(store.stagingById("legacy").effectiveDate, "2026-12-31");
    await store.updateStaging("legacy", { effectiveDate: "2027-01-01" });
    store.close();
    await store.load();
    assert.equal(store.stagingById("legacy").effectiveDate, "2027-01-01");
    assert.equal(store.collectionEntries()[0].effectiveDate, "2026-12-31");
    assert.ok(store.db.prepare("SELECT name FROM sqlite_master WHERE name = 'idx_collection_entries_effective_supplier'").get());
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("effective-day calculations use destination month settings, deductions and advances", () => {
  const input = {
    suppliers: [{ id: "supplier", name: "Supplier", deductionEnabled: true }],
    entries: [{ supplierId: "supplier", collectionDate: "2026-12-31", effectiveDate: "2027-01-01", netWeightKg: 100 }],
    monthlySettings: [{ month: "2026-12", teaPricePerKg: 100 }, { month: "2027-01", teaPricePerKg: 300, deductionPercent: 2 }]
  };
  assert.equal(buildGreenLeafBook({ ...input, month: "2026-12" }).rows.length, 0);
  const row = buildGreenLeafBook({ ...input, month: "2027-01" }).rows[0];
  assert.equal(row.dailyKg[0], 100);
  assert.equal(row.deductionKg, 2);
  assert.equal(row.leafValue, 29400);
  assert.equal(suggestAdvancePayment({ ...input, month: "2027-01", asOfMonth: "2027-01", supplierId: "supplier" }).leafValue, 29400);
  assert.equal(collectionRecordRows(input.entries, { recordDateFrom: "2027-01-01", recordDateTo: "2027-01-01" }).length, 1);
  assert.equal(stagingRows(input.entries, { stagingDate: "2026-12-31" }).length, 1);
  assert.equal(validateEffectiveDate("2000-02-29"), "2000-02-29");
  assert.throws(() => validateEffectiveDate("2100-02-29"));
});

test("staging drafts preserve weights across rendering and wait for ordered saves, failures and retries", async () => {
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const edits = new StagingEdits(async (id, date) => {
    calls.push(date);
    if (date === "2027-01-01") await blocked;
    if (date === "") throw new Error("Invalid date");
  });
  const row = { id: "stage", collectionDate: "2026-12-31", netWeightKg: 10 };
  edits.weights.set(row.id, "8.5");
  const first = edits.saveEffectiveDate(row.id, "2027-01-01");
  const second = edits.saveEffectiveDate(row.id, "2027-01-02");
  let ready = false;
  const waiting = edits.waitForDates([row.id]).then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);
  assert.equal(edits.effectiveDate(row), "2027-01-02");
  edits.retain([{ ...row, netWeightKg: 10 }]);
  assert.equal(edits.netWeight(row), "8.5");
  release();
  await Promise.all([first, second, waiting]);
  assert.deepEqual(calls, ["2027-01-01", "2027-01-02"]);
  await assert.rejects(edits.saveEffectiveDate(row.id, ""), /Invalid date/);
  await assert.rejects(edits.waitForDates([row.id]), /Save the effective date/);
  await edits.saveEffectiveDate(row.id, "2027-01-03");
  await edits.waitForDates([row.id]);
  edits.clear([row.id]);
  assert.equal(edits.netWeight(row), 10);
});
