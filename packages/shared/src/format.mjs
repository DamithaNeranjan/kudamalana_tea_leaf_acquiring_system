export function roundToTwo(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function roundWhole(value) {
  return Math.round(Number(value || 0));
}

export function sumNumbers(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

export function localMonthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function localDateValue(date = new Date()) {
  return `${localMonthValue(date)}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDateTime(value) {
  if (!value) return "";
  const normalized =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
  return new Date(normalized);
}

export function formatCurrency(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function formatOptionalDecimal(value, { blankZero = false } = {}) {
  const number = Number(value || 0);
  if (blankZero && number === 0) return "";
  const hasDecimals = !Number.isInteger(number);
  return number.toLocaleString("en-US", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0
  });
}

export function parseAmountInput(value) {
  return String(value || "").replace(/,/g, "");
}

export function formatAmountInput(value) {
  const clean = parseAmountInput(value).replace(/[^\d.]/g, "");
  const [integerPart, ...decimalParts] = clean.split(".");
  const integer = integerPart ? Number(integerPart).toLocaleString("en-US") : "";
  const decimal = decimalParts.length ? `.${decimalParts.join("").slice(0, 2)}` : "";
  return `${integer}${decimal}`;
}

export function paginateRows(rows, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    page: safePage,
    totalPages
  };
}
