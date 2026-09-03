import http from "node:http";
import { pathToFileURL } from "node:url";
import { buildGreenLeafBookWithAutoArrears } from "../../../packages/shared/src/index.mjs";
import { bearerToken, cookiesFromHeader, parseJsonBody, sendJson } from "../../../packages/shared/src/http.mjs";
import { createMemoryStore } from "./store.mjs";
import { createMySqlStore, loadBackendEnv } from "./mysqlStore.mjs";

export function createBackendServer({ store = createMemoryStore() } = {}) {
  function allowedOrigins() {
    return String(process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean);
  }

  function corsHeaders(request) {
    const origin = String(request.headers.origin || "").replace(/\/$/, "");
    const origins = allowedOrigins();
    const allowOrigin =
      origin && (!origins.length || origins.includes("*") || origins.includes(origin))
        ? origin
        : !origin
          ? "*"
          : "";
    const headers = {
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type, authorization, x-sync-token",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      vary: "Origin"
    };
    if (allowOrigin) headers["access-control-allow-origin"] = allowOrigin;
    return headers;
  }

  function send(request, response, status, payload, headers = {}) {
    sendJson(response, status, payload, {
      ...corsHeaders(request),
      ...headers
    });
  }

  function cookieToken(request) {
    const cookies = cookiesFromHeader(request.headers.cookie);
    return cookies.tea_session || "";
  }

  function sessionToken(request) {
    return bearerToken(request) || cookieToken(request);
  }

  function validDesktopSyncToken(request) {
    const expected = process.env.CLOUD_SYNC_TOKEN || process.env.DESKTOP_CLOUD_SYNC_TOKEN || "";
    const provided = request.headers["x-sync-token"] || "";
    return Boolean(expected && provided && provided === expected);
  }

  function sessionCookie(token) {
    const secure = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
    return [
      `tea_session=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      secure ? "Secure" : "",
      "Max-Age=28800"
    ]
      .filter(Boolean)
      .join("; ");
  }

  function clearSessionCookie() {
    return "tea_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
  }

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "OPTIONS") return send(request, response, 204, {});
      if (request.method === "GET" && url.pathname === "/health") {
        return send(request, response, 200, { ok: true, service: "tea-backend" });
      }
      if (request.method === "POST" && url.pathname === "/auth/login") {
        const payload = await parseJsonBody(request);
        const login = await store.login(payload.username, payload.password);
        return send(request, response, 200, login, { "set-cookie": sessionCookie(login.token) });
      }
      if (request.method === "POST" && url.pathname === "/auth/logout") {
        return send(request, response, 200, await store.logout(sessionToken(request)), {
          "set-cookie": clearSessionCookie()
        });
      }
      if (request.method === "GET" && url.pathname === "/auth/me") {
        return send(request, response, 200, { user: await store.getCurrentUser(sessionToken(request)) });
      }
      if (request.method === "GET" && url.pathname === "/admin/users") {
        return send(request, response, 200, {
          users: await store.listUsers(sessionToken(request), url.searchParams.get("role"))
        });
      }
      if (request.method === "POST" && url.pathname === "/admin/users") {
        return send(request, response, 201, await store.createUser(sessionToken(request), await parseJsonBody(request)));
      }
      if (request.method === "PATCH" && url.pathname.startsWith("/admin/users/")) {
        const userId = decodeURIComponent(url.pathname.split("/").pop());
        return send(request, response, 200, await store.updateUser(sessionToken(request), userId, await parseJsonBody(request)));
      }
      if (request.method === "GET" && url.pathname === "/admin/directors") {
        return send(request, response, 200, { directors: await store.listDirectors(sessionToken(request)) });
      }
      if (request.method === "POST" && url.pathname === "/admin/directors") {
        return send(request, response, 201, await store.createDirector(sessionToken(request), await parseJsonBody(request)));
      }
      if (request.method === "POST" && url.pathname === "/sync/desktop") {
        const payload = await parseJsonBody(request);
        if (validDesktopSyncToken(request) && store.syncFromTrustedDesktop) {
          return send(request, response, 200, await store.syncFromTrustedDesktop(payload));
        }
        return send(request, response, 200, await store.syncFromDesktop(sessionToken(request), payload));
      }
      if (request.method === "GET" && url.pathname === "/green-leaf-book") {
        const month = url.searchParams.get("month");
        const input = await store.getGreenLeafInput(sessionToken(request), month);
        const book = buildGreenLeafBookWithAutoArrears(input);
        const payments = new Map(
          (input.supplierPayments || [])
            .filter((payment) => payment.month === book.month)
            .map((payment) => [payment.supplierId, payment])
        );
        return send(request, response, 200, {
          ...book,
          closure: (input.monthClosures || []).find((closure) => closure.month === book.month && closure.closed !== false && !closure.reopenedAt) || null,
          closed: Boolean((input.monthClosures || []).find((closure) => closure.month === book.month && closure.closed !== false && !closure.reopenedAt)),
          rows: book.rows.map((row) => ({ ...row, payment: payments.get(row.supplierId) || null }))
        });
      }
      if (request.method === "GET" && url.pathname === "/balances") {
        return send(request, response, 200, await store.getBalances(sessionToken(request), url.searchParams.get("month")));
      }
      if (request.method === "POST" && url.pathname === "/balances/mark-paid") {
        return send(request, response, 201, await store.markBalancePaid(sessionToken(request), await parseJsonBody(request)));
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/balances/signals/")) {
        const signalId = decodeURIComponent(url.pathname.split("/").pop());
        return send(request, response, 200, await store.deleteBalanceSignal(sessionToken(request), signalId));
      }
      if (request.method === "POST" && url.pathname === "/balances/factory-officer-payments") {
        return send(request, response, 201, await store.addFactoryOfficerTransfer(sessionToken(request), await parseJsonBody(request)));
      }
      if (request.method === "PATCH" && url.pathname.startsWith("/balances/factory-officer-payments/")) {
        const signalId = decodeURIComponent(url.pathname.split("/").pop());
        return send(request, response, 200, await store.updateFactoryOfficerTransfer(sessionToken(request), signalId, await parseJsonBody(request)));
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/balances/factory-officer-payments/")) {
        const signalId = decodeURIComponent(url.pathname.split("/").pop());
        return send(request, response, 200, await store.deleteFactoryOfficerTransfer(sessionToken(request), signalId));
      }
      if (request.method === "GET" && url.pathname === "/advance-signals") {
        return send(request, response, 200, await store.listAdvanceSignals(sessionToken(request)));
      }
      if (request.method === "GET" && url.pathname === "/advance-signals/suggestion") {
        return send(
          request,
          response,
          200,
          await store.getAdvanceSuggestion(sessionToken(request), {
            month: url.searchParams.get("month"),
            scope: url.searchParams.get("scope"),
            targetId: url.searchParams.get("targetId")
          })
        );
      }
      if (request.method === "POST" && url.pathname === "/advance-signals") {
        return send(request, response, 201, await store.createAdvanceSignal(sessionToken(request), await parseJsonBody(request)));
      }
      if (request.method === "PATCH" && url.pathname.startsWith("/advance-signals/")) {
        const signalId = decodeURIComponent(url.pathname.split("/").pop());
        return send(request, response, 200, await store.updateAdvanceSignal(sessionToken(request), signalId, await parseJsonBody(request)));
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/advance-signals/")) {
        const signalId = decodeURIComponent(url.pathname.split("/").pop());
        return send(request, response, 200, await store.deleteAdvanceSignal(sessionToken(request), signalId));
      }
      if (request.method === "POST" && url.pathname === "/signals/mark-read") {
        return send(request, response, 200, await store.markSignalRead(sessionToken(request), await parseJsonBody(request)));
      }
      if (request.method === "GET" && url.pathname === "/web-audit-log") {
        return send(request, response, 200, { auditLogs: await store.listWebAuditLogs(sessionToken(request)) });
      }
      return send(request, response, 404, { error: "Not found" });
    } catch (error) {
      return send(request, response, error.status || 500, { error: error.message || "Internal server error" });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await loadBackendEnv();
  const port = Number(process.env.PORT || 8080);
  const store = await createMySqlStore();
  const server = createBackendServer({ store });
  server.listen(port, () => {
    console.log(`Tea backend listening on http://localhost:${port}`);
  });

  async function shutdown() {
    server.close(async () => {
      await store.close();
      process.exit(0);
    });
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
