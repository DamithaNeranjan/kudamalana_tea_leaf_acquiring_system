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

function previousMonthValue(month) {
  const [year, monthNumber] = normalizeMonth(month).split("-").map(Number);
  const previous = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentMonthValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonthValue(month) {
  const [year, monthNumber] = normalizeMonth(month).split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRange(startMonth, endMonth) {
  const months = [];
  let cursor = normalizeMonth(startMonth);
  const end = normalizeMonth(endMonth);
  while (cursor <= end) {
    months.push(cursor);
    cursor = nextMonthValue(cursor);
  }
  return months;
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
  const monthSetting = Array.isArray(input.monthlySettings)
    ? input.monthlySettings.find((setting) => setting.month === month)
    : input.monthlySettings;
  const settings = { ...DEFAULT_SETTINGS, ...(monthSetting || {}) };
  const entries = input.entries || [];
  const supplierMap = new Map((input.suppliers || []).map((supplier) => [supplier.id, supplier]));
  for (const entry of entries.filter((item) => sameMonth(item.collectionDate, month))) {
    if (!supplierMap.has(entry.supplierId)) {
      supplierMap.set(entry.supplierId, {
        id: entry.supplierId,
        code: entry.supplierCode || "",
        name: entry.supplierName || "Unknown supplier",
        lineName: entry.lineName || "",
        deductionEnabled: false,
        ownTransportAdditionEnabled: false,
        factoryTransportDeductionEnabled: false
      });
    }
  }
  const suppliers = [...supplierMap.values()];
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
      const totalAdditions = money(leafValue + ownTransportAddition);
      const totalDeductions = money(
        teaPacketDeduction +
          factoryTransportDeduction +
          totalAdvances +
          fertilizerDeduction +
          arrearsCarriedForward
      );
      const balanceExcluded = Boolean(supplier.excludeFromBalance);
      const balanceToPay = balanceExcluded ? 0 : money(leafValue + ownTransportAddition - totalDeductions);

      return {
        supplierId: supplier.id,
        supplierCode: supplier.code,
        supplierName: supplier.name,
        lineId: supplier.lineId,
        lineName: supplier.lineName,
        paymentMode: supplier.paymentMode || "cash",
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
        totalAdditions,
        totalDeductions,
        balanceToPay,
        balanceExcluded
      };
    })
    .filter((row) => row.totalKg > 0 || row.totalDeductions > 0 || row.ownTransportAddition > 0)
    .map((row, index) => ({ rowNumber: index + 1, ...row }));

  return { month, settings, dayCount, rows };
}

export function buildGreenLeafBookWithAutoArrears(input) {
  const month = normalizeMonth(input.month);
  const previousMonth = previousMonthValue(month);
  const payments = input.supplierPayments || [];
  const previousPayments = new Set(
    payments.filter((payment) => payment.month === previousMonth).map((payment) => payment.supplierId)
  );
  const previousBook = buildGreenLeafBook({ ...input, month: previousMonth });
  const existingCarryForward = new Set(
    (input.arrears || [])
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
    ...input,
    month,
    arrears: [...(input.arrears || []), ...automaticArrears]
  });
}

export function suggestAdvancePayment(input) {
  const month = normalizeMonth(input.month);
  const asOfMonth = normalizeMonth(input.asOfMonth || currentMonthValue());
  const payments = input.supplierPayments || [];
  const closedMonths = new Set(
    (input.monthClosures || [])
      .filter((closure) => closure.closed !== false && !closure.reopenedAt)
      .map((closure) => closure.month)
  );
  const rows = monthRange(month, asOfMonth).map((bookMonth) => {
    const book = buildGreenLeafBookWithAutoArrears({ ...input, month: bookMonth });
    return {
      month: bookMonth,
      row: book.rows.find((item) => item.supplierId === input.supplierId)
    };
  });
  const firstRow = rows.find((item) => item.row)?.row;
  const row = rows.at(-1)?.row || firstRow;
  if (!row) {
    return {
      supplierId: input.supplierId,
      suggestedAmount: 0,
      leafValue: 0,
      arrearsCarriedForward: 0,
      totalAdvances: 0
    };
  }
  const leafValue = money(sumBy(rows, (item) => item.row?.leafValue));
  const arrearsCarriedForward = money(sumBy(rows, (item) => item.row?.arrearsCarriedForward));
  const totalAdvances = money(sumBy(rows, (item) => item.row?.totalAdvances));
  if (row.balanceExcluded) {
    return {
      supplierId: input.supplierId,
      suggestedAmount: 0,
      leafValue,
      arrearsCarriedForward,
      totalAdvances
    };
  }
  const suggestedAmount = money(
    sumBy(rows, ({ month: rowMonth, row: monthRow }) => {
      if (!monthRow || monthRow.balanceExcluded) return 0;
      if (closedMonths.has(rowMonth)) return 0;
      if (payments.some((payment) => payment.supplierId === input.supplierId && payment.month === rowMonth)) return 0;
      return Math.max(0, monthRow.balanceToPay);
    })
  );
  return {
    supplierId: input.supplierId,
    suggestedAmount,
    leafValue,
    arrearsCarriedForward,
    totalAdvances
  };
}
