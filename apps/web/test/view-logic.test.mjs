import test from "node:test";
import assert from "node:assert/strict";
import { greenLeafBookTotals, poyaDaysForMonth } from "../src/utils/bookLogic.js";
import {
  filterBalanceSignalRows,
  filterFactoryPaymentRows,
  paginateWebRows,
  targetLabel,
  visibleAdvanceSignals
} from "../src/utils/signalLogic.js";

test("web book logic totals visible rows and separates positive and negative balances", () => {
  const totals = greenLeafBookTotals(
    [
      {
        dailyKg: [10, 5],
        totalKg: 15,
        deductionKg: 1,
        finalKg: 14,
        ownTransportAddition: 70,
        totalAdvances: 100,
        fertilizerDeduction: 20,
        teaPacketDeduction: 30,
        factoryTransportDeduction: 40,
        arrearsCarriedForward: 50,
        totalAdditions: 2870,
        totalDeductions: 240,
        balanceToPay: 2630
      },
      {
        dailyKg: [0, 2],
        totalKg: 2,
        deductionKg: 0,
        finalKg: 2,
        ownTransportAddition: 0,
        totalAdvances: 0,
        fertilizerDeduction: 0,
        teaPacketDeduction: 0,
        factoryTransportDeduction: 0,
        arrearsCarriedForward: 500,
        totalAdditions: 400,
        totalDeductions: 500,
        balanceToPay: -100
      }
    ],
    2
  );

  assert.deepEqual(totals.dailyKg, [10, 7]);
  assert.equal(totals.totalKg, 17);
  assert.equal(totals.totalAdditions, 3270);
  assert.equal(totals.totalDeductions, 740);
  assert.equal(totals.positiveBalanceToPay, 2630);
  assert.equal(totals.negativeBalanceToPay, -100);
  assert.ok(poyaDaysForMonth("2026-05").size >= 1);
  assert.deepEqual([...poyaDaysForMonth("")], []);
});

test("web signal logic filters role-specific balance and advance rows", () => {
  const rows = [
    { supplierCode: "S001", supplierName: "Nimal", lineName: "Line A", signal: null },
    { supplierCode: "S002", supplierName: "Kamal", lineName: "Line B", signal: { id: "sig_read", readAt: "2026-05-01T10:00:00.000Z" } },
    { supplierCode: "S003", supplierName: "Sunil", lineName: "Line C", signal: { id: "sig_unread" } }
  ];

  assert.equal(filterBalanceSignalRows(rows, "line", ["lineName"], { canManage: true, showRead: true }).length, 3);
  assert.deepEqual(
    filterBalanceSignalRows(rows, "", ["supplierName"], { canManage: true, showRead: false }).map((row) => row.supplierCode),
    ["S001", "S003"]
  );
  assert.deepEqual(
    filterBalanceSignalRows(rows, "", ["supplierName"], { canManage: false, showRead: false }).map((row) => row.supplierCode),
    ["S003"]
  );

  const factoryPayments = [
    { comment: "Bank cash", markedByDisplayName: "Director", readAt: "2026-05-01T10:00:00.000Z" },
    { comment: "Counter transfer", markedByDisplayName: "Office" }
  ];
  assert.equal(filterFactoryPaymentRows(factoryPayments, "counter", true).length, 1);
  assert.equal(filterFactoryPaymentRows(factoryPayments, "", false).length, 1);

  const advances = visibleAdvanceSignals(
    [
      { targetLabel: "S001 - Nimal", effectiveMonth: "2026-05", scope: "supplier", markedAt: "2026-05-01T10:00:00.000Z" },
      { targetLabel: "Line A", effectiveMonth: "2026-06", scope: "line", markedAt: "2026-06-01T10:00:00.000Z", readAt: "2026-06-02T10:00:00.000Z" },
      { targetLabel: "S002 - Kamal", effectiveMonth: "2026-05", scope: "supplier", markedAt: "2026-05-02T10:00:00.000Z" }
    ],
    { supplierFilter: "s", monthFilter: "2026-05", typeFilter: "supplier", showRead: false }
  );
  assert.deepEqual(advances.map((signal) => signal.targetLabel), ["S002 - Kamal", "S001 - Nimal"]);
  assert.equal(targetLabel("supplier", { code: "S004", name: "Cash Supplier" }), "S004 - Cash Supplier");
  assert.equal(targetLabel("line", { name: "Line A" }), "Line A");
  assert.deepEqual(paginateWebRows([1, 2, 3], 2, 2), { rows: [3], page: 2, totalPages: 2 });
});
