import { sumNumbers } from "../../../../packages/shared/src/format.mjs";

export function poyaDaysForMonth(month) {
  const [year, monthNumber] = String(month || "").split("-").map(Number);
  if (!year || !monthNumber) return new Set();
  const monthStart = Date.UTC(year, monthNumber - 1, 1);
  const monthEnd = Date.UTC(year, monthNumber, 0, 23, 59, 59);
  const synodicMonthMs = 29.530588853 * 24 * 60 * 60 * 1000;
  const referenceFullMoonUtc = Date.UTC(2000, 0, 21, 4, 40);
  const firstCycle = Math.floor((monthStart - referenceFullMoonUtc) / synodicMonthMs) - 1;
  const days = new Set();

  for (let offset = 0; offset < 5; offset += 1) {
    const fullMoonUtc = referenceFullMoonUtc + (firstCycle + offset) * synodicMonthMs;
    if (fullMoonUtc < monthStart - synodicMonthMs || fullMoonUtc > monthEnd + synodicMonthMs) continue;
    const sriLankaDate = new Date(fullMoonUtc + 5.5 * 60 * 60 * 1000);
    if (sriLankaDate.getUTCFullYear() === year && sriLankaDate.getUTCMonth() + 1 === monthNumber) {
      days.add(sriLankaDate.getUTCDate());
    }
  }

  return days;
}

export function greenLeafBookTotals(rows, dayCount) {
  const total = (field) => sumNumbers(rows.map((row) => row[field]));
  return {
    dailyKg: Array.from({ length: dayCount }, (_, index) => sumNumbers(rows.map((row) => row.dailyKg[index]))),
    totalKg: total("totalKg"),
    deductionKg: total("deductionKg"),
    finalKg: total("finalKg"),
    ownTransportAddition: total("ownTransportAddition"),
    totalAdvances: total("totalAdvances"),
    fertilizerDeduction: total("fertilizerDeduction"),
    teaPacketDeduction: total("teaPacketDeduction"),
    factoryTransportDeduction: total("factoryTransportDeduction"),
    arrearsCarriedForward: total("arrearsCarriedForward"),
    totalAdditions: sumNumbers(rows.map((row) => row.totalAdditions ?? row.ownTransportAddition)),
    totalDeductions: total("totalDeductions"),
    positiveBalanceToPay: sumNumbers(rows.map((row) => Math.max(0, Number(row.balanceToPay || 0)))),
    negativeBalanceToPay: sumNumbers(rows.map((row) => Math.min(0, Number(row.balanceToPay || 0))))
  };
}
