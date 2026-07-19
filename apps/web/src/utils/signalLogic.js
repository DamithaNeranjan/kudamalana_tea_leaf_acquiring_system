import { paginateRows } from "../../../../packages/shared/src/format.mjs";

export const WEB_PAGE_SIZE = 10;

export function targetLabel(scope, target) {
  if (!target) return "";
  return scope === "line" ? target.name : `${target.code || ""} - ${target.name || ""}`.trim();
}

export function paginateWebRows(rows, page, pageSize = WEB_PAGE_SIZE) {
  return paginateRows(rows, page, pageSize);
}

export function filterBalanceSignalRows(rows, text, fields, { canManage, showRead }) {
  const needle = String(text || "").trim().toLowerCase();
  return rows
    .filter((row) => fields.some((field) => String(row[field] || "").toLowerCase().includes(needle)))
    .filter((row) => {
      if (canManage) return showRead || !row.signal?.readAt;
      return row.signal && (showRead || !row.signal.readAt);
    });
}

export function filterFactoryPaymentRows(rows, text, showRead) {
  const needle = String(text || "").trim().toLowerCase();
  return rows
    .filter(
      (payment) =>
        String(payment.comment || "").toLowerCase().includes(needle) ||
        String(payment.markedByDisplayName || "").toLowerCase().includes(needle)
    )
    .filter((payment) => showRead || !payment.readAt);
}

export function visibleAdvanceSignals(signals, { supplierFilter = "", monthFilter = "", typeFilter = "", showRead = true } = {}) {
  const supplierText = String(supplierFilter || "").trim().toLowerCase();
  return signals
    .filter((signal) => String(signal.targetLabel || "").toLowerCase().includes(supplierText))
    .filter((signal) => !monthFilter || signal.effectiveMonth === monthFilter)
    .filter((signal) => !typeFilter || signal.scope === typeFilter)
    .filter((signal) => showRead || !signal.readAt)
    .sort((a, b) => new Date(b.markedAt) - new Date(a.markedAt));
}
