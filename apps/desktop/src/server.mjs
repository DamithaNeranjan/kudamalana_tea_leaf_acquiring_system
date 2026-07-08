import http from "node:http";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { pathToFileURL } from "node:url";
import QRCode from "qrcode";
import { suggestAdvancePayment } from "../../../packages/shared/src/index.mjs";
import { LocalStore } from "./localStore.mjs";

export async function createDesktopSyncServer({ store = new LocalStore() } = {}) {
  await store.load();
  const sessions = new Map();

  async function body(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
  }

  function send(response, status, payload) {
    response.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,PUT,OPTIONS"
    });
    response.end(JSON.stringify(payload));
  }

  function bearer(request) {
    const header = request.headers.authorization || "";
    return header.startsWith("Bearer ") ? header.slice(7) : "";
  }

  function requireOfficeSession(request) {
    const token = bearer(request);
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
        return send(response, 200, { user: store.loginLineUser(await body(request)) });
      }
      if (request.method === "POST" && url.pathname === "/sync/collections") {
        const payload = await body(request);
        return send(response, 200, await store.importCollections(payload.deviceId, payload.records));
      }
      if (request.method === "GET" && url.pathname.startsWith("/sync/status/")) {
        return send(response, 200, { deviceId: url.pathname.split("/").pop(), ready: true });
      }
      if (request.method === "POST" && url.pathname === "/office/login") {
        const payload = await body(request);
        const user = store.login(payload.username, payload.password);
        const token = randomBytes(24).toString("hex");
        sessions.set(token, { user, createdAt: new Date().toISOString() });
        return send(response, 200, { token, user });
      }
      if (url.pathname.startsWith("/office/")) {
        const session = requireOfficeSession(request);
        if (request.method === "GET" && url.pathname === "/office/profile") {
          return send(response, 200, store.officeUserById(session.user.id));
        }
        if (request.method === "PUT" && url.pathname === "/office/profile") {
          const before = store.officeUserById(session.user.id);
          const updatedUser = await store.updateOfficeProfile(session.user.id, await body(request));
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
          sessions.delete(bearer(request));
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
          return send(response, 201, await auditedUpsert(session, "lineUsers", await body(request), "line_user"));
        }
        if (request.method === "POST" && url.pathname === "/office/office-users") {
          requireDesktopAdmin(session);
          return send(response, 201, await auditedUpsert(session, "officeUsers", await body(request), "office_user"));
        }
        if (request.method === "POST" && url.pathname === "/office/tea-lines") {
          return send(response, 201, await auditedUpsert(session, "teaLines", await body(request), "line"));
        }
        if (request.method === "POST" && url.pathname === "/office/suppliers") {
          return send(response, 201, await auditedUpsert(session, "suppliers", await body(request), "sup"));
        }
        if (request.method === "POST" && url.pathname === "/office/monthly-settings") {
          return send(response, 201, await auditedUpsert(session, "monthlySettings", await body(request), "settings"));
        }
        if (request.method === "POST" && url.pathname === "/office/supplier-month-overrides") {
          return send(response, 201, await auditedUpsert(session, "supplierMonthOverrides", await body(request), "override"));
        }
        if (request.method === "POST" && url.pathname === "/office/line-supplier-price-overrides") {
          const payload = await body(request);
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
          return send(response, 201, await auditedUpsert(session, "advances", await body(request), "adv"));
        }
        if (request.method === "POST" && url.pathname === "/office/fertilizer-issues") {
          return send(response, 201, await auditedUpsert(session, "fertilizerIssues", await body(request), "fert"));
        }
        if (request.method === "POST" && url.pathname === "/office/tea-packets") {
          return send(response, 201, await auditedUpsert(session, "teaPackets", await body(request), "tea_packet"));
        }
        if (request.method === "PUT" && url.pathname.startsWith("/office/staging/")) {
          const id = url.pathname.split("/").pop();
          const before = store.stagingById(id);
          const updated = await store.updateStaging(id, await body(request));
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
        if (request.method === "GET" && url.pathname === "/office/green-leaf-book") {
          const month = url.searchParams.get("month");
          return send(response, 200, store.greenLeafBook(month));
        }
        if (request.method === "GET" && url.pathname === "/office/month-end-summary") {
          const month = url.searchParams.get("month");
          return send(response, 200, store.monthEndSummary(month));
        }
        if (request.method === "POST" && url.pathname === "/office/supplier-payments") {
          const payload = await body(request);
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
