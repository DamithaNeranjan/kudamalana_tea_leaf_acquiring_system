import test from "node:test";
import assert from "node:assert/strict";
import {
  beginCloudSyncPlan,
  configuredBackendToken,
  configuredBackendUrl,
  resolveBackendToken,
  sentCounts
} from "../src/cloudSync.mjs";

test("desktop cloud sync helpers resolve config and trusted-token counts", async () => {
  assert.equal(configuredBackendUrl({ backendUrl: "http://backend/" }, {}), "http://backend");
  assert.equal(configuredBackendUrl({}, { BACKEND_URL: "http://env-backend/" }), "http://env-backend");
  assert.equal(configuredBackendToken({}, { CLOUD_SYNC_TOKEN: "cloud", DESKTOP_CLOUD_SYNC_TOKEN: "desktop" }), "cloud");
  assert.equal(configuredBackendToken({}, { DESKTOP_CLOUD_SYNC_TOKEN: "desktop" }), "desktop");
  assert.deepEqual(sentCounts({ sync: {}, teaLines: [1, 2], suppliers: [1], ignored: "text" }), {
    teaLines: 2,
    suppliers: 1
  });

  const loginCalls = [];
  const token = await resolveBackendToken({
    payload: { username: "admin", password: "admin123" },
    backendUrl: "http://backend",
    env: {},
    fetchImpl: async (url, options) => {
      loginCalls.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ token: "session_token" }) };
    }
  });
  assert.equal(token, "session_token");
  assert.deepEqual(loginCalls, [{ url: "http://backend/auth/login", body: { username: "admin", password: "admin123" } }]);
});

test("desktop cloud sync plan preserves cursor and sent-count behavior", () => {
  const runLog = [];
  const store = {
    lastSuccessfulCloudSync: () => ({ cursorTo: "2026-05-01T00:00:00.000Z" }),
    exportChangedGreenLeafBookSyncData: (options) => ({
      sync: { mode: options.full || !options.since ? "full" : "incremental", cursorFrom: options.since, cursorTo: options.cursorTo },
      officeUsers: options.includeOfficeUsers ? [{ id: "office_1" }] : [],
      teaLines: [{ id: "line_1" }],
      suppliers: []
    }),
    beginCloudSyncRun: (run) => {
      runLog.push(run);
      return { id: "run_1", ...run };
    }
  };

  const plan = beginCloudSyncPlan(store, { fullSync: false, syncOfficeUsers: true }, "http://backend");
  assert.equal(plan.cursorFrom, "2026-05-01T00:00:00.000Z");
  assert.equal(plan.syncPayload.sync.mode, "incremental");
  assert.equal(plan.sentCounts.officeUsers, 1);
  assert.equal(plan.sentCounts.teaLines, 1);
  assert.equal(runLog[0].mode, "incremental");
  assert.equal(runLog[0].backendUrl, "http://backend");
});
