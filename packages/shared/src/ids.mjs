import { randomUUID } from "node:crypto";

export function makeId(prefix) {
  if (!prefix || typeof prefix !== "string") {
    throw new Error("A non-empty prefix is required");
  }
  return `${prefix}_${randomUUID()}`;
}

export function normalizeMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Month must use YYYY-MM format");
  }
  return month;
}

export function daysInMonth(month) {
  const [year, monthNumber] = normalizeMonth(month).split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}
