import test from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../renderer/modules/api.js";
import { formatAuditAction, formatAuditDetails, formatAuditEntity, summarizeCounts, summarizeReceived } from "../renderer/modules/auditCloud.js";
import { formatBillCurrency, formatBookNumber, formatDateTime } from "../renderer/modules/format.js";
import { checked, escapeAttribute, escapeHtml } from "../renderer/modules/html.js";

test("desktop renderer helpers preserve formatting and escaping behavior", () => {
  assert.equal(formatBookNumber(1234), "1,234");
  assert.equal(formatBookNumber(1234.5), "1,234.50");
  assert.equal(formatBookNumber(0, { blankZero: true }), "");
  assert.equal(formatBillCurrency(1234), "1,234.00");
  assert.equal(formatDateTime("not-a-date"), "not-a-date");
  assert.match(formatDateTime("2026-05-01T10:30:15.000Z"), /\d/);
  assert.equal(escapeAttribute('A&B"C<'), "A&amp;B&quot;C&lt;");
  assert.equal(escapeHtml(`A&B"C<'`), "A&amp;B&quot;C&lt;&#39;");
  assert.equal(checked(true), "checked");
  assert.equal(checked(false), "");
});

test("desktop audit and cloud helpers preserve summaries", () => {
  assert.equal(formatAuditAction("bulk_update"), "Bulk Update");
  assert.equal(formatAuditEntity({ entityType: "tea_line", entityLabel: "Line A" }), "Tea Line - Line A");
  assert.equal(
    formatAuditDetails({
      before: { id: "ignored", displayName: "Old", active: false },
      after: { id: "ignored", displayName: "New", active: true }
    }),
    "Display Name: Old -> New; Active: No -> Yes"
  );
  assert.equal(formatAuditDetails({ after: { username: "office", password: "hidden" } }), "Created Username office, Password hidden");
  assert.equal(summarizeCounts({ teaLines: 2, suppliers: 0 }), "teaLines: 2");
  assert.equal(
    summarizeReceived({ counts: { suppliers: 1 }, importedOfficeUsers: { importedCount: 2 } }),
    "suppliers: 1, importedOfficeUsers: 2"
  );
  assert.equal(summarizeReceived(null), "No changed records");
});

test("desktop renderer API helper sends auth headers and surfaces JSON errors", async () => {
  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: false,
      json: async () => ({ error: "Nope" })
    };
  };
  try {
    const api = createApi({ baseUrl: "http://desktop", getOfficeToken: () => "token_1" });
    await assert.rejects(() => api("/office/state"), /Nope/);
    assert.equal(calls[0].url, "http://desktop/office/state");
    assert.equal(calls[0].options.headers.authorization, "Bearer token_1");
    assert.equal(calls[0].options.headers["content-type"], "application/json");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
