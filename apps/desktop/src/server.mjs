import http from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import QRCode from "qrcode";
import { suggestAdvancePayment } from "../../../packages/shared/src/index.mjs";
import { bearerToken, parseJsonBody, sendJson } from "../../../packages/shared/src/http.mjs";
import { beginCloudSyncPlan, configuredBackendToken, configuredBackendUrl, normalizeBackendUrl, resolveBackendToken } from "./cloudSync.mjs";
import { LocalStore } from "./localStore.mjs";

function desktopDataDir(cwd = process.cwd()) {
  return process.env.DESKTOP_DATA_DIR || join(cwd, "desktop-data");
}

function desktopConfigPath(cwd = process.cwd()) {
  return process.env.DESKTOP_CONFIG_PATH || join(desktopDataDir(cwd), ".env");
}

function parseEnvContent(content) {
  const entries = [];
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      entries.push({ type: "raw", value: line });
      continue;
    }
    const [key, ...rest] = line.split("=");
    const normalizedKey = key.trim();
    const value = rest.join("=").trim();
    entries.push({ type: "entry", key: normalizedKey, value });
    values[normalizedKey] = value;
  }
  return { entries, values };
}

function formatEnvContent(entries) {
  return `${entries
    .map((entry) => (entry.type === "entry" ? `${entry.key}=${entry.value}` : entry.value))
    .join("\n")
    .replace(/\n+$/u, "")}\n`;
}

async function persistDesktopEnv(updates, cwd = process.cwd()) {
  const envPath = desktopConfigPath(cwd);
  await mkdir(dirname(envPath), { recursive: true });
  let parsed = { entries: [], values: {} };
  try {
    parsed = parseEnvContent(await readFile(envPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  for (const [key, rawValue] of Object.entries(updates)) {
    const value = String(rawValue || "").trim();
    const entryIndex = parsed.entries.findIndex((entry) => entry.type === "entry" && entry.key === key);
    if (!value) {
      if (entryIndex >= 0) parsed.entries.splice(entryIndex, 1);
      delete parsed.values[key];
      delete process.env[key];
      continue;
    }
    if (entryIndex >= 0) parsed.entries[entryIndex].value = value;
    else parsed.entries.push({ type: "entry", key, value });
    parsed.values[key] = value;
    process.env[key] = value;
  }

  await writeFile(envPath, formatEnvContent(parsed.entries), "utf8");
}

async function loadDesktopEnv(cwd = process.cwd()) {
  for (const envPath of [
    process.env.DESKTOP_CONFIG_PATH,
    process.env.DESKTOP_DATA_DIR ? join(process.env.DESKTOP_DATA_DIR, ".env") : "",
    join(cwd, ".env"),
    join(cwd, "..", ".env"),
    join(cwd, "..", "..", ".env")
  ].filter(Boolean)) {
    try {
      const content = await readFile(envPath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const [key, ...rest] = trimmed.split("=");
        if (!process.env[key]) process.env[key] = rest.join("=").trim();
      }
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

function cloudSyncConfig(session) {
  const backendUrl = configuredBackendUrl({}, process.env);
  return {
    backendUrl: session?.user?.role === "admin" ? backendUrl : "",
    backendUrlConfigured: Boolean(backendUrl),
    tokenConfigured: Boolean(configuredBackendToken({}, process.env)),
    canManage: session?.user?.role === "admin"
  };
}

export async function createDesktopSyncServer({ store = new LocalStore() } = {}) {
  await loadDesktopEnv();
  await store.load();
  const sessions = new Map();

  function send(response, status, payload) {
    sendJson(response, status, payload, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,PUT,OPTIONS"
    });
  }

  function requireOfficeSession(request) {
    const token = bearerToken(request);
    if (!sessions.has(token)) {
      const error = new Error("Office login is required");
      error.status = 401;
      throw error;
    }
    return sessions.get(token);
  }

  function requireDesktopAdmin(session) {
    if (session.user.role !== "admin") {
      const error = new Error("Admin access is required");
      error.status = 403;
      throw error;
    }
  }

  const entityConfig = {
    lineUsers: { type: "line_user", label: (record) => record.displayName || record.username, unique: ["username"] },
    officeUsers: { type: "office_user", label: (record) => record.displayName || record.username, unique: ["username"] },
    teaLines: { type: "tea_line", label: (record) => record.name, unique: ["name"] },
    suppliers: { type: "supplier", label: (record) => `${record.code || ""} ${record.name || ""}`.trim(), unique: ["code"] },
    monthlySettings: { type: "monthly_setting", label: (record) => record.month, unique: ["month"] },
    supplierMonthOverrides: {
      type: "supplier_month_override",
      label: (record) => `${record.supplierId || ""} ${record.month || ""}`.trim(),
      unique: ["supplierId", "month"]
    },
    advances: { type: "advance", label: (record) => `${record.date || ""} ${record.amount || ""}`.trim() },
    fertilizerIssues: { type: "fertilizer_issue", label: (record) => `${record.date || ""} ${record.totalAmount || ""}`.trim() },
    teaPackets: { type: "tea_packet", label: (record) => `${record.date || ""} ${record.totalAmount || ""}`.trim() }
  };

  function sanitizeAuditValue(value) {
    if (Array.isArray(value)) return value.map((item) => sanitizeAuditValue(item));
    if (!value || typeof value !== "object") return value;
    const result = {};
    for (const [key, childValue] of Object.entries(value)) {
      if (/password|token|authorization/i.test(key)) continue;
      result[key] = sanitizeAuditValue(childValue);
    }
    return result;
  }

  function existingRecord(collection, input) {
    const records = store.data?.[collection] || [];
    if (input.id) {
      const byId = records.find((record) => record.id === input.id);
      if (byId) return byId;
    }
    const unique = entityConfig[collection]?.unique || [];
    if (unique.length && unique.every((field) => input[field] !== undefined && input[field] !== "")) {
      return records.find((record) => unique.every((field) => String(record[field] || "").toLowerCase() === String(input[field] || "").toLowerCase())) || null;
    }
    return null;
  }

  function auditLabel(collection, record) {
    if (!record) return "";
    return entityConfig[collection]?.label(record) || record.name || record.displayName || record.username || record.id || "";
  }

  function auditSummary(action, collection, record) {
    const label = auditLabel(collection, record);
    const noun = entityConfig[collection]?.type || collection;
    return `${action === "create" ? "Created" : "Updated"} ${noun}${label ? `: ${label}` : ""}`;
  }

  function logAudit(session, entry) {
    store.recordAudit({
      ...entry,
      user: session.user,
      before: sanitizeAuditValue(entry.before),
      after: sanitizeAuditValue(entry.after)
    });
  }

  async function auditedUpsert(session, collection, payload, prefix) {
    const before = existingRecord(collection, payload);
    const saved = await store.upsert(collection, payload, prefix);
    const after = existingRecord(collection, saved) || saved;
    const action = before ? "update" : "create";
    logAudit(session, {
      action,
      entityType: entityConfig[collection].type,
      entityId: after.id || saved.id,
      entityLabel: auditLabel(collection, after),
      summary: auditSummary(action, collection, after),
      before,
      after
    });
    return saved;
  }

  function localSyncUrls(request) {
    const port = Number(process.env.DESKTOP_SYNC_PORT || 7070);
    const candidates = [];
    for (const addresses of Object.values(networkInterfaces())) {
      for (const address of addresses || []) {
        if (address.family === "IPv4" && !address.internal) {
          candidates.push(`http://${address.address}:${port}`);
        }
      }
    }
    const host = request.headers.host?.split(":")[0];
    if (host && host !== "127.0.0.1" && host !== "localhost") {
      candidates.unshift(`http://${host}:${port}`);
    }
    return [...new Set(candidates)];
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://desktop.local");
      if (request.method === "OPTIONS") return send(response, 204, {});
      if (request.method === "GET" && url.pathname === "/health") {
        return send(response, 200, { ok: true, service: "tea-desktop-sync" });
      }
      if (request.method === "GET" && url.pathname === "/sync/master-data") {
        return send(response, 200, store.getMasterData());
      }
      if (request.method === "POST" && url.pathname === "/sync/login") {
        return send(response, 200, { user: store.loginLineUser(await parseJsonBody(request)) });
      }
      if (request.method === "POST" && url.pathname === "/sync/collections") {
        const payload = await parseJsonBody(request);
        return send(response, 200, await store.importCollections(payload.deviceId, payload.records));
      }
      if (request.method === "GET" && url.pathname.startsWith("/sync/status/")) {
        return send(response, 200, { deviceId: url.pathname.split("/").pop(), ready: true });
      }
      if (request.method === "POST" && url.pathname === "/office/login") {
        const payload = await parseJsonBody(request);
        const user = store.login(payload.username, payload.password);
        const token = randomBytes(24).toString("hex");
        const session = { user, createdAt: new Date().toISOString() };
        sessions.set(token, session);
        logAudit(session, {
          action: "login",
          entityType: "office_session",
          entityId: user.id,
          entityLabel: user.displayName || user.username,
          summary: `Logged in: ${user.displayName || user.username}`
        });
        return send(response, 200, { token, user });
      }
      if (url.pathname.startsWith("/office/")) {
        const session = requireOfficeSession(request);
        if (request.method === "GET" && url.pathname === "/office/profile") {
          return send(response, 200, store.officeUserById(session.user.id));
        }
        if (request.method === "PUT" && url.pathname === "/office/profile") {
          const before = store.officeUserById(session.user.id);
          const updatedUser = await store.updateOfficeProfile(session.user.id, await parseJsonBody(request));
          session.user = updatedUser;
          logAudit(session, {
            action: "update",
            entityType: "office_profile",
            entityId: updatedUser.id,
            entityLabel: updatedUser.displayName || updatedUser.username,
            summary: `Updated office profile: ${updatedUser.displayName || updatedUser.username}`,
            before,
            after: updatedUser
          });
          return send(response, 200, updatedUser);
        }
        if (request.method === "POST" && url.pathname === "/office/logout") {
          logAudit(session, {
            action: "logout",
            entityType: "office_session",
            entityId: session.user.id,
            entityLabel: session.user.displayName || session.user.username,
            summary: `Logged out: ${session.user.displayName || session.user.username}`
          });
          sessions.delete(bearerToken(request));
          return send(response, 200, { ok: true });
        }
        if (request.method === "GET" && url.pathname === "/office/pairing-info") {
          const urls = localSyncUrls(request);
          const primaryUrl = urls[0] || `http://127.0.0.1:${Number(process.env.DESKTOP_SYNC_PORT || 7070)}`;
          const pairingPayload = JSON.stringify({
            type: "kudamalana-tablet-sync",
            version: 1,
            syncUrl: primaryUrl
          });
          return send(response, 200, {
            primaryUrl,
            urls,
            pairingPayload,
            qrDataUrl: await QRCode.toDataURL(pairingPayload, {
              errorCorrectionLevel: "M",
              margin: 1,
              width: 260,
              color: {
                dark: "#17351F",
                light: "#FFFFFF"
              }
            })
          });
        }
        if (request.method === "POST" && url.pathname === "/office/line-users") {
          return send(response, 201, await auditedUpsert(session, "lineUsers", await parseJsonBody(request), "line_user"));
        }
        if (request.method === "POST" && url.pathname === "/office/office-users") {
          requireDesktopAdmin(session);
          return send(response, 201, await auditedUpsert(session, "officeUsers", await parseJsonBody(request), "office_user"));
        }
        if (request.method === "POST" && url.pathname === "/office/tea-lines") {
          return send(response, 201, await auditedUpsert(session, "teaLines", await parseJsonBody(request), "line"));
        }
        if (request.method === "POST" && url.pathname === "/office/suppliers") {
          return send(response, 201, await auditedUpsert(session, "suppliers", await parseJsonBody(request), "sup"));
        }
        if (request.method === "POST" && url.pathname === "/office/monthly-settings") {
          return send(response, 201, await auditedUpsert(session, "monthlySettings", await parseJsonBody(request), "settings"));
        }
        if (request.method === "POST" && url.pathname === "/office/supplier-month-overrides") {
          return send(response, 201, await auditedUpsert(session, "supplierMonthOverrides", await parseJsonBody(request), "override"));
        }
        if (request.method === "POST" && url.pathname === "/office/line-supplier-price-overrides") {
          const payload = await parseJsonBody(request);
          const result = await store.upsertLineSupplierPriceOverride(payload);
          logAudit(session, {
            action: "bulk_update",
            entityType: "supplier_month_override",
            entityId: [result.lineId || result.lineName, result.month].filter(Boolean).join(":"),
            entityLabel: `${result.lineName || result.lineId || "Line"} ${result.month}`,
            summary: `Updated ${result.updatedCount} supplier price override${result.updatedCount === 1 ? "" : "s"} for ${result.lineName || result.lineId}`,
            before: null,
            after: { request: payload, result }
          });
          return send(response, 201, result);
        }
        if (request.method === "POST" && url.pathname === "/office/advances") {
          return send(response, 201, await auditedUpsert(session, "advances", await parseJsonBody(request), "adv"));
        }
        if (request.method === "POST" && url.pathname === "/office/fertilizer-issues") {
          return send(response, 201, await auditedUpsert(session, "fertilizerIssues", await parseJsonBody(request), "fert"));
        }
        if (request.method === "POST" && url.pathname === "/office/tea-packets") {
          return send(response, 201, await auditedUpsert(session, "teaPackets", await parseJsonBody(request), "tea_packet"));
        }
        if (request.method === "PUT" && url.pathname.startsWith("/office/staging/")) {
          const id = url.pathname.split("/").pop();
          const before = store.stagingById(id);
          const updated = await store.updateStaging(id, await parseJsonBody(request));
          logAudit(session, {
            action: "update",
            entityType: "collection_staging",
            entityId: id,
            entityLabel: updated?.supplierName || before?.supplierName || id,
            summary: `Updated staged collection: ${updated?.supplierName || id}`,
            before,
            after: updated
          });
          return send(response, 200, updated);
        }
        if (request.method === "POST" && url.pathname.endsWith("/post") && url.pathname.startsWith("/office/staging/")) {
          const id = url.pathname.split("/").at(-2);
          const before = store.stagingById(id);
          const entry = await store.postStaging(id, session.user);
          logAudit(session, {
            action: "post",
            entityType: "collection_entry",
            entityId: entry.id,
            entityLabel: entry.supplierName || entry.supplierCode,
            summary: `Posted collection entry: ${entry.supplierName || entry.supplierCode}`,
            before,
            after: entry
          });
          return send(response, 200, entry);
        }
        if (request.method === "GET" && url.pathname === "/office/audit-log") {
          return send(response, 200, { auditLogs: store.auditLogs() });
        }
        if (request.method === "GET" && url.pathname === "/office/state") {
          return send(response, 200, store.data);
        }
        if (request.method === "GET" && url.pathname === "/office/cloud-sync/status") {
          return send(response, 200, {
            ...store.cloudSyncStatus({
              page: url.searchParams.get("page"),
              pageSize: url.searchParams.get("pageSize"),
              status: url.searchParams.get("status"),
              mode: url.searchParams.get("mode")
            }),
            config: cloudSyncConfig(session)
          });
        }
        if (request.method === "PUT" && url.pathname === "/office/cloud-sync/config") {
          requireDesktopAdmin(session);
          const payload = await parseJsonBody(request);
          const backendUrl = normalizeBackendUrl(payload.backendUrl);
          if (!backendUrl) {
            const error = new Error("Backend URL is required");
            error.status = 400;
            throw error;
          }
          let urlValue;
          try {
            urlValue = new URL(backendUrl);
          } catch {
            const error = new Error("Backend URL must be a valid http or https URL");
            error.status = 400;
            throw error;
          }
          if (!["http:", "https:"].includes(urlValue.protocol)) {
            const error = new Error("Backend URL must start with http:// or https://");
            error.status = 400;
            throw error;
          }
          const before = cloudSyncConfig(session);
          const updates = { BACKEND_URL: backendUrl };
          const backendToken = String(payload.backendToken || "").trim();
          if (backendToken) updates.CLOUD_SYNC_TOKEN = backendToken;
          await persistDesktopEnv(updates);
          const after = cloudSyncConfig(session);
          logAudit(session, {
            action: "update",
            entityType: "cloud_sync_config",
            entityId: "desktop_cloud_sync",
            entityLabel: "Desktop cloud sync configuration",
            summary: "Updated desktop cloud sync configuration",
            before,
            after
          });
          return send(response, 200, after);
        }
        if (request.method === "POST" && url.pathname === "/office/cloud-sync") {
          const payload = await parseJsonBody(request);
          const backendUrl = configuredBackendUrl(payload);
          if (!backendUrl) {
            const error = new Error("BACKEND_URL is not configured for web app sync");
            error.status = 400;
            throw error;
          }
          const backendToken = await resolveBackendToken({ payload, backendUrl });
          if (!backendToken) {
            const error = new Error("CLOUD_SYNC_TOKEN is not configured for web app sync");
            error.status = 400;
            throw error;
          }
          const { syncPayload, sentCounts, syncRun } = beginCloudSyncPlan(store, payload, backendUrl);
          try {
            const syncResponse = await fetch(`${backendUrl}/sync/desktop`, {
              method: "POST",
              headers: {
              authorization: `Bearer ${backendToken}`,
              "x-sync-token": backendToken,
              "content-type": "application/json"
            },
              body: JSON.stringify(syncPayload)
            });
            const responsePayload = await syncResponse.json();
            if (!syncResponse.ok) {
              const error = new Error(responsePayload.error || "Cloud sync failed");
              error.status = syncResponse.status;
              throw error;
            }
            const importedOfficeUsers =
              payload.syncOfficeUsers === true
                ? store.importSyncedOfficeUsers(responsePayload.officeUsers || [])
                : { importedCount: 0 };
            const completedRun = store.completeCloudSyncRun(syncRun.id, {
              received: {
                backendSyncId: responsePayload.id,
                counts: responsePayload.counts,
                importedOfficeUsers
              }
            });
            return send(response, 200, { ...responsePayload, sentCounts, importedOfficeUsers, syncRun: completedRun });
          } catch (error) {
            store.failCloudSyncRun(syncRun.id, error);
            throw error;
          }
        }
        if (request.method === "GET" && url.pathname === "/office/green-leaf-book") {
          const month = url.searchParams.get("month");
          return send(response, 200, store.greenLeafBook(month));
        }
        if (request.method === "POST" && url.pathname === "/office/green-leaf-book/close") {
          const payload = await parseJsonBody(request);
          const result = store.closeGreenLeafBook(payload.month, session.user, payload.note);
          logAudit(session, {
            action: "close",
            entityType: "green_leaf_book",
            entityId: result.month,
            entityLabel: result.month,
            summary: `Closed Green Leaf Book for ${result.month}`,
            before: null,
            after: result
          });
          return send(response, 201, result);
        }
        if (request.method === "POST" && url.pathname === "/office/green-leaf-book/reopen") {
          requireDesktopAdmin(session);
          const payload = await parseJsonBody(request);
          const before = store.monthClosure(payload.month);
          const result = store.reopenGreenLeafBook(payload.month, session.user, payload.note);
          logAudit(session, {
            action: "reopen",
            entityType: "green_leaf_book",
            entityId: result.month,
            entityLabel: result.month,
            summary: `Reopened Green Leaf Book for ${result.month}`,
            before,
            after: result
          });
          return send(response, 200, result);
        }
        if (request.method === "GET" && url.pathname === "/office/month-end-summary") {
          const month = url.searchParams.get("month");
          return send(response, 200, store.monthEndSummary(month));
        }
        if (request.method === "POST" && url.pathname === "/office/supplier-bill-print-audit") {
          const payload = await parseJsonBody(request);
          const printedAt = new Date().toISOString();
          const suppliers = Array.isArray(payload.suppliers) ? payload.suppliers : [];
          const supplierNames = suppliers.map((supplier) => supplier.name || supplier.supplierName || supplier.code || supplier.supplierCode).filter(Boolean);
          logAudit(session, {
            action: "print",
            entityType: "supplier_bill",
            entityId: `${payload.month || "unknown"}:${suppliers.map((supplier) => supplier.id || supplier.supplierId || supplier.code || "").join(",")}`,
            entityLabel: supplierNames.join(", "),
            summary: `Printed ${supplierNames.length} supplier bill${supplierNames.length === 1 ? "" : "s"} for ${payload.month || "selected month"}: ${supplierNames.join(", ")}`,
            before: null,
            after: {
              month: payload.month,
              printedAt,
              suppliers: suppliers.map((supplier) => ({
                id: supplier.id || supplier.supplierId,
                code: supplier.code || supplier.supplierCode,
                name: supplier.name || supplier.supplierName
              }))
            }
          });
          return send(response, 201, { ok: true, printedAt, supplierCount: supplierNames.length });
        }
        if (request.method === "POST" && url.pathname === "/office/supplier-payments") {
          const payload = await parseJsonBody(request);
          const result = await store.recordSupplierPayments(payload, session.user);
          logAudit(session, {
            action: "record_payment",
            entityType: "supplier_payment",
            entityId: `${result.scope}:${result.month}:${payload.supplierId || payload.lineName || "batch"}`,
            entityLabel: payload.supplierId || payload.lineName || result.month,
            summary: `Recorded ${result.recordedCount} ${result.scope} payment${result.recordedCount === 1 ? "" : "s"} for ${result.month}`,
            before: null,
            after: { request: payload, result }
          });
          return send(response, 201, result);
        }
        if (request.method === "GET" && url.pathname === "/office/advance-suggestion") {
          const month = url.searchParams.get("month");
          const supplierId = url.searchParams.get("supplierId");
          const exported = store.exportForCloud();
          return send(
            response,
            200,
            suggestAdvancePayment({ month, supplierId, ...exported, entries: exported.collectionEntries })
          );
        }
      }
      return send(response, 404, { error: "Not found" });
    } catch (error) {
      return send(response, error.status || 500, { error: error.message || "Internal server error" });
    }
  });
  server.on("close", () => store.close?.());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.DESKTOP_SYNC_PORT || 7070);
  const server = await createDesktopSyncServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`Desktop sync server listening on http://0.0.0.0:${port}`);
  });
}
