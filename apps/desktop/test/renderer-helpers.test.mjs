import test from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../renderer/modules/api.js";
import { formatAuditAction, formatAuditDetails, formatAuditEntity, summarizeCounts, summarizeReceived } from "../renderer/modules/auditCloud.js";
import { formatAdvanceAmounts, formatAdvanceDates, greenLeafBookTotals, poyaDaysForMonth } from "../renderer/modules/book.js";
import { formatBillCurrency, formatBookNumber, formatDateTime } from "../renderer/modules/format.js";
import { checked, escapeAttribute, escapeHtml } from "../renderer/modules/html.js";
import { compareNewestFirst, latestComparableValue, pagedItems } from "../renderer/modules/listing.js";
import { collectionRecordPage, collectionRecordRows, postAllStagingMessage, stagingRows } from "../renderer/modules/records.js";

test("desktop renderer helpers preserve formatting and escaping behavior", () => {
  assert.equal(formatBookNumber(1234), "1,234");
  assert.equal(formatBookNumber(1234.5), "1,234.50");
  assert.equal(formatBookNumber(0, { blankZero: true }), "");
  assert.equal(formatBillCurrency(1234), "1,234.00");
  assert.equal(formatDateTime("not-a-date"), "not-a-date");
  assert.match(formatDateTime("2026-05-01T10:30:15.000Z"), /\d/);
  assert.equal(escapeAttribute('A&B"C<'), "A&amp;B&quot;C&lt;");
  assert.equal(escapeHtml(`A&B"C<'`), "A&amp;B&quot;C&lt;&#39;");
  assert.equal(checked(true), "checked");
  assert.equal(checked(false), "");
});

test("desktop audit and cloud helpers preserve summaries", () => {
  assert.equal(formatAuditAction("bulk_update"), "Bulk Update");
  assert.equal(formatAuditEntity({ entityType: "tea_line", entityLabel: "Line A" }), "Tea Line - Line A");
  assert.equal(
    formatAuditDetails({
      before: { id: "ignored", displayName: "Old", active: false },
      after: { id: "ignored", displayName: "New", active: true }
    }),
    "Display Name: Old -> New; Active: No -> Yes"
  );
  assert.equal(formatAuditDetails({ after: { username: "office", password: "hidden" } }), "Created Username office, Password hidden");
  assert.equal(summarizeCounts({ teaLines: 2, suppliers: 0 }), "teaLines: 2");
  assert.equal(
    summarizeReceived({ counts: { suppliers: 1 }, importedOfficeUsers: { importedCount: 2 } }),
    "suppliers: 1, importedOfficeUsers: 2"
  );
  assert.equal(summarizeReceived(null), "No changed records");
});

test("desktop renderer API helper sends auth headers and surfaces JSON errors", async () => {
  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: false,
      json: async () => ({ error: "Nope" })
    };
  };
  try {
    const api = createApi({ baseUrl: "http://desktop", getOfficeToken: () => "token_1" });
    await assert.rejects(() => api("/office/state"), /Nope/);
    assert.equal(calls[0].url, "http://desktop/office/state");
    assert.equal(calls[0].options.headers.authorization, "Bearer token_1");
    assert.equal(calls[0].options.headers["content-type"], "application/json");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("desktop listing helpers preserve table sort and pagination behavior", () => {
  const rows = [
    { id: "old", updatedAt: "2026-05-01T00:00:00.000Z" },
    { id: "new", updatedAt: "2026-05-02T00:00:00.000Z" },
    { id: "fallback_b" },
    { id: "fallback_a" }
  ];
  assert.deepEqual(rows.toSorted((a, b) => compareNewestFirst(a, b, "updatedAt")).map((row) => row.id), [
    "new",
    "old",
    "fallback_b",
    "fallback_a"
  ]);
  assert.equal(latestComparableValue({ sequence: "5e2" }, ["sequence"]), 500);
  assert.equal(latestComparableValue({ updatedAt: "" }, ["updatedAt"]), 0);
  assert.deepEqual(pagedItems([1, 2, 3, 4], 99, 3), { page: 2, pageCount: 2, start: 3, rows: [4] });
});

test("desktop book helpers preserve totals, poya days, and advance formatting", () => {
  const totals = greenLeafBookTotals(
    [
      {
        dailyKg: [10, 5],
        totalKg: 15,
        deductionKg: 1,
        finalKg: 14,
        ownTransportAddition: 20,
        totalAdvances: 10,
        fertilizerDeduction: 2,
        teaPacketDeduction: 3,
        factoryTransportDeduction: 4,
        arrearsCarriedForward: 5,
        totalDeductions: 24,
        balanceToPay: 100
      },
      {
        dailyKg: [2, 3],
        totalKg: 5,
        deductionKg: 0,
        finalKg: 5,
        ownTransportAddition: 8,
        totalAdditions: 18,
        totalAdvances: 0,
        fertilizerDeduction: 0,
        teaPacketDeduction: 1,
        factoryTransportDeduction: 2,
        arrearsCarriedForward: 3,
        totalDeductions: 6,
        balanceToPay: -25
      }
    ],
    2
  );
  assert.deepEqual(totals.dailyKg, [12, 8]);
  assert.equal(totals.totalAdditions, 38);
  assert.equal(totals.balanceToPay, 75);
  assert.equal(totals.positiveBalanceToPay, 100);
  assert.equal(totals.negativeBalanceToPay, -25);

  assert.ok(poyaDaysForMonth("2026-07").size >= 1);
  assert.equal(formatAdvanceDates({ advancePayments: [{ date: "2026-07-01<script>" }] }), "<span>2026-07-01&lt;script&gt;</span>");
  assert.equal(formatAdvanceAmounts({ advancePayments: [{ amount: 1234.5 }] }), "<span>1,234.50</span>");
});

test("desktop staging and collection record helpers preserve filters and pages", () => {
  const staging = stagingRows(
    [
      { id: "old", supplierName: "Alpha", supplierCode: "A1", lineName: "North", collectionDate: "2026-07-01", importedAt: "2026-07-01" },
      { id: "new", supplierName: "Beta", supplierCode: "B1", lineName: "North", collectionDate: "2026-07-01", importedAt: "2026-07-02" },
      { id: "other", supplierName: "Beta", supplierCode: "B1", lineName: "South", collectionDate: "2026-07-03", importedAt: "2026-07-03" }
    ],
    { stagingSupplier: "b1", stagingLine: "north", stagingDate: "2026-07-01" }
  );
  assert.deepEqual(staging.map((row) => row.id), ["new"]);

  const records = collectionRecordRows(
    [
      { id: "a", supplierName: "Alpha", lineName: "North", postedByOfficeUserName: "Manager", lineUserName: "Collector", collectionDate: "2026-07-01", postedAt: "2026-07-01" },
      { id: "b", supplierName: "Beta", lineName: "South", postedByOfficeUserName: "Manager", lineUserName: "Collector", collectionDate: "2026-07-02", postedAt: "2026-07-03" }
    ],
    { recordSupplier: "", recordLine: "", recordPostedBy: "manager", recordCollector: "collector", recordDateFrom: "2026-07-02", recordDateTo: "" }
  );
  assert.deepEqual(records.map((record) => record.id), ["b"]);
  assert.deepEqual(collectionRecordPage([1, 2, 3], 9, 2), { page: 2, pageCount: 2, start: 2, pageRecords: [3], shownEnd: 3 });
  assert.equal(
    postAllStagingMessage(2),
    "This will permanently post 2 staged tablet records using the net weights currently shown in the table."
  );
});
