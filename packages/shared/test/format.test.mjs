import test from "node:test";
import assert from "node:assert/strict";
import {
  formatAmountInput,
  formatCurrency,
  formatOptionalDecimal,
  localDateValue,
  localMonthValue,
  paginateRows,
  parseAmountInput,
  parseDateTime,
  roundToTwo,
  sumNumbers
} from "../src/index.mjs";

test("shared display utilities preserve current formatting behavior", () => {
  assert.equal(roundToTwo(12.345), 12.35);
  assert.equal(sumNumbers([1, "2", null, undefined, 3.5]), 6.5);
  assert.equal(formatCurrency(1234), "1,234.00");
  assert.equal(formatOptionalDecimal(1234), "1,234");
  assert.equal(formatOptionalDecimal(1234.5), "1,234.50");
  assert.equal(formatOptionalDecimal(0, { blankZero: true }), "");
  assert.equal(parseAmountInput("1,234.50"), "1234.50");
  assert.equal(formatAmountInput("1234.567"), "1,234.56");
});

test("shared date and pagination helpers preserve local month/date semantics", () => {
  const date = new Date(2026, 6, 1, 23, 30);
  assert.equal(localMonthValue(date), "2026-07");
  assert.equal(localDateValue(date), "2026-07-01");
  assert.equal(parseDateTime("2026-07-01 12:30:00").toISOString(), "2026-07-01T12:30:00.000Z");
  assert.deepEqual(paginateRows([1, 2, 3, 4], 2, 2), { rows: [3, 4], page: 2, totalPages: 2 });
  assert.deepEqual(paginateRows([1, 2, 3], 99, 2), { rows: [3], page: 2, totalPages: 2 });
});
