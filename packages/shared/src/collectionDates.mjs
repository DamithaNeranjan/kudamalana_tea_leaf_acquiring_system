// Collection dates are calendar values, never timestamp instants.
export function effectiveCollectionDate(record) {
  return record.effectiveDate ?? record.collectionDate;
}

export function validateEffectiveDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]) return value;
  }
  const error = new Error("Effective date must be a valid calendar date in YYYY-MM-DD format.");
  error.status = 400;
  throw error;
}
