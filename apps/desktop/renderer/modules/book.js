import { formatBookNumber, sumNumbers } from "./format.js";
import { escapeHtml } from "./html.js";

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
    balanceToPay: total("balanceToPay"),
    positiveBalanceToPay: sumNumbers(rows.map((row) => Math.max(0, Number(row.balanceToPay || 0)))),
    negativeBalanceToPay: sumNumbers(rows.map((row) => Math.min(0, Number(row.balanceToPay || 0))))
  };
}

export function poyaDaysForMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
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
    const fullMoonYear = sriLankaDate.getUTCFullYear();
    const fullMoonMonth = sriLankaDate.getUTCMonth() + 1;
    if (fullMoonYear === year && fullMoonMonth === monthNumber) {
      days.add(sriLankaDate.getUTCDate());
    }
  }
  return days;
}

export function formatAdvanceDates(row) {
  const payments = row.advancePayments || [];
  if (!payments.length) return "";
  return payments.map((advance) => `<span>${escapeHtml(advance.date)}</span>`).join("");
}

export function formatAdvanceAmounts(row) {
  const payments = row.advancePayments || [];
  if (!payments.length) return "";
  return payments.map((advance) => `<span>${formatBookNumber(advance.amount)}</span>`).join("");
}
