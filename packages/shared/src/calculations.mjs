import { daysInMonth, normalizeMonth } from "./ids.mjs";

const DEFAULT_SETTINGS = {
  teaPricePerKg: 200,
  deductionPercent: 2,
  ownTransportAdditionPerKg: 5,
  factoryTransportDeductionPerKg: 3
};

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function kg(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function wholeKg(value) {
  return Math.round(Number(value || 0));
}

function sameMonth(dateValue, month) {
  return String(dateValue || "").startsWith(month);
}

function supplierOverride(overrides, supplierId, month) {
  return overrides.find(
    (override) => override.supplierId === supplierId && override.month === month
  ) || {};
}

function supplierEntries(entries, supplierId, month) {
  return entries.filter(
    (entry) => entry.supplierId === supplierId && sameMonth(entry.collectionDate, month)
  );
}

function effectiveTeaPrice(settings, override) {
  return Number(override.teaPricePerKg ?? settings.teaPricePerKg);
}

function sumBy(items, selector) {
  return items.reduce((total, item) => total + Number(selector(item) || 0), 0);
}

export function buildGreenLeafBook(input) {
  const month = normalizeMonth(input.month);
  const settings = { ...DEFAULT_SETTINGS, ...(input.monthlySettings || {}) };
  const suppliers = input.suppliers || [];
  const entries = input.entries || [];
  const advances = input.advances || [];
  const fertilizerInstallments = input.fertilizerInstallments || [];
  const teaPackets = input.teaPackets || [];
  const arrears = input.arrears || [];
  const overrides = input.supplierMonthOverrides || [];
  const dayCount = daysInMonth(month);

  const rows = suppliers
    .map((supplier) => {
      const override = supplierOverride(overrides, supplier.id, month);
      const rowsForSupplier = supplierEntries(entries, supplier.id, month);
      const dailyKg = Array.from({ length: dayCount }, (_, index) => {
        const day = String(index + 1).padStart(2, "0");
        return kg(
          sumBy(rowsForSupplier.filter((entry) => entry.collectionDate.slice(8, 10) === day), (entry) =>
            entry.netWeightKg ?? entry.grossWeightKg
          )
        );
      });

      const totalKg = kg(sumBy(dailyKg, (value) => value));
      const deductionEnabled = Boolean(supplier.deductionEnabled) && override.disableDeduction !== true;
      const deductionKg = deductionEnabled ? wholeKg(totalKg * (settings.deductionPercent / 100)) : 0;
      const finalKg = kg(totalKg - deductionKg);

      const ownTransportEnabled =
        Boolean(supplier.ownTransportAdditionEnabled) && override.disableOwnTransportAddition !== true;
      const ownTransportAddition = ownTransportEnabled
        ? money(finalKg * settings.ownTransportAdditionPerKg)
        : 0;

      const factoryTransportEnabled =
        Boolean(supplier.factoryTransportDeductionEnabled) && override.disableFactoryTransportDeduction !== true;
      const factoryTransportDeduction = factoryTransportEnabled
        ? money(finalKg * settings.factoryTransportDeductionPerKg)
        : 0;

      const supplierAdvances = advances.filter(
        (advance) => advance.supplierId === supplier.id && advance.effectiveMonth === month
      );
      const totalAdvances = money(sumBy(supplierAdvances, (advance) => advance.amount));

      const fertilizerDeduction = money(
        sumBy(
          fertilizerInstallments.filter(
            (installment) => installment.supplierId === supplier.id && installment.effectiveMonth === month
          ),
          (installment) => installment.amount
        )
      );

      const teaPacketDeduction = money(
        sumBy(
          teaPackets.filter((packet) => packet.supplierId === supplier.id && packet.effectiveMonth === month),
          (packet) => packet.totalAmount ?? Number(packet.packetCount || 0) * Number(packet.perPacketPrice || 0)
        )
      );

      const arrearsCarriedForward = money(
        sumBy(
          arrears.filter((item) => item.supplierId === supplier.id && item.effectiveMonth === month),
          (item) => item.amount
        )
      );

      const pricePerKg = effectiveTeaPrice(settings, override);
      const leafValue = money(finalKg * pricePerKg);
      const totalDeductions = money(
        teaPacketDeduction +
          factoryTransportDeduction +
          totalAdvances +
          fertilizerDeduction +
          arrearsCarriedForward
      );
      const balanceToPay = money(leafValue + ownTransportAddition - totalDeductions);

      return {
        supplierId: supplier.id,
        supplierCode: supplier.code,
        supplierName: supplier.name,
        lineName: supplier.lineName,
        dailyKg,
        totalKg,
        deductionKg,
        finalKg,
        ownTransportAddition,
        advancePayments: supplierAdvances.map((advance) => ({
          date: advance.date,
          amount: money(advance.amount)
        })),
        fertilizerDeduction,
        factoryTransportDeduction,
        totalAdvances,
        teaPacketDeduction,
        arrearsCarriedForward,
        pricePerKg,
        leafValue,
        totalDeductions,
        balanceToPay
      };
    })
    .filter((row) => row.totalKg > 0 || row.totalDeductions > 0 || row.ownTransportAddition > 0)
    .map((row, index) => ({ rowNumber: index + 1, ...row }));

  return { month, settings, dayCount, rows };
}

export function suggestAdvancePayment(input) {
  const book = buildGreenLeafBook(input);
  const row = book.rows.find((item) => item.supplierId === input.supplierId);
  if (!row) {
    return {
      supplierId: input.supplierId,
      suggestedAmount: 0,
      leafValue: 0,
      ownTransportAddition: 0,
      deductions: 0
    };
  }
  return {
    supplierId: input.supplierId,
    suggestedAmount: Math.max(0, row.balanceToPay),
    leafValue: row.leafValue,
    ownTransportAddition: row.ownTransportAddition,
    deductions: row.totalDeductions
  };
}
