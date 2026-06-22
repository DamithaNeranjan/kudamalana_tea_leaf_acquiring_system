import test from "node:test";
import assert from "node:assert/strict";
import { buildGreenLeafBook, suggestAdvancePayment } from "../src/index.mjs";

const suppliers = [
  {
    id: "sup_1",
    code: "S001",
    name: "Nimal",
    lineName: "Line A",
    deductionEnabled: true,
    ownTransportAdditionEnabled: true,
    factoryTransportDeductionEnabled: false
  },
  {
    id: "sup_2",
    code: "S002",
    name: "Kamal",
    lineName: "Line A",
    deductionEnabled: false,
    ownTransportAdditionEnabled: false,
    factoryTransportDeductionEnabled: true
  }
];

test("builds monthly green leaf rows with deductions, additions, and balance", () => {
  const book = buildGreenLeafBook({
    month: "2026-05",
    suppliers,
    monthlySettings: {
      teaPricePerKg: 200,
      deductionPercent: 2,
      ownTransportAdditionPerKg: 5,
      factoryTransportDeductionPerKg: 3
    },
    entries: [
      { supplierId: "sup_1", collectionDate: "2026-05-01", netWeightKg: 100 },
      { supplierId: "sup_1", collectionDate: "2026-05-02", netWeightKg: 50 },
      { supplierId: "sup_2", collectionDate: "2026-05-01", netWeightKg: 40 }
    ],
    advances: [{ supplierId: "sup_1", date: "2026-05-10", effectiveMonth: "2026-05", amount: 1000 }],
    fertilizerInstallments: [{ supplierId: "sup_1", effectiveMonth: "2026-05", amount: 500 }],
    teaPackets: [{ supplierId: "sup_1", effectiveMonth: "2026-05", packetCount: 2, perPacketPrice: 100 }],
    arrears: [{ supplierId: "sup_1", effectiveMonth: "2026-05", amount: 300 }]
  });

  assert.equal(book.rows.length, 2);
  assert.equal(book.rows[0].totalKg, 150);
  assert.equal(book.rows[0].deductionKg, 3);
  assert.equal(book.rows[0].finalKg, 147);
  assert.equal(book.rows[0].ownTransportAddition, 735);
  assert.equal(book.rows[0].totalDeductions, 2000);
  assert.equal(book.rows[0].balanceToPay, 28135);
  assert.equal(book.rows[1].factoryTransportDeduction, 120);
});

test("supplier-month overrides can change price and transport behavior", () => {
  const book = buildGreenLeafBook({
    month: "2026-05",
    suppliers,
    entries: [{ supplierId: "sup_2", collectionDate: "2026-05-03", netWeightKg: 10 }],
    supplierMonthOverrides: [
      {
        supplierId: "sup_2",
        month: "2026-05",
        teaPricePerKg: 250,
        disableFactoryTransportDeduction: true
      }
    ]
  });

  assert.equal(book.rows[0].pricePerKg, 250);
  assert.equal(book.rows[0].factoryTransportDeduction, 0);
  assert.equal(book.rows[0].balanceToPay, 2500);
});

test("includes posted entries even when supplier master row is unavailable", () => {
  const book = buildGreenLeafBook({
    month: "2026-05",
    suppliers: [],
    entries: [
      {
        supplierId: "sup_missing",
        supplierName: "Late Synced Supplier",
        lineName: "Line B",
        collectionDate: "2026-05-04",
        netWeightKg: 18
      }
    ]
  });

  assert.equal(book.rows.length, 1);
  assert.equal(book.rows[0].supplierName, "Late Synced Supplier");
  assert.equal(book.rows[0].totalKg, 18);
});

test("suggests advance payment from unpaid effective month balance", () => {
  const suggestion = suggestAdvancePayment({
    month: "2026-05",
    supplierId: "sup_1",
    suppliers,
    entries: [{ supplierId: "sup_1", collectionDate: "2026-05-01", netWeightKg: 25 }],
    arrears: [{ supplierId: "sup_1", effectiveMonth: "2026-05", amount: 500 }]
  });

  assert.equal(suggestion.suggestedAmount, 4420);
});
