import {
  formatCurrency,
  formatOptionalDecimal,
  localDateValue,
  localMonthValue,
  sumNumbers
} from "../../../../packages/shared/src/format.mjs";

export { localDateValue, localMonthValue, sumNumbers };

export function formatDateTime(value) {
  if (!value) return "";
  const normalized =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? value.replace(" ", "T")
      : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function formatBookNumber(value, options = {}) {
  return formatOptionalDecimal(value, options);
}

export function formatBillCurrency(value) {
  return formatCurrency(value);
}
