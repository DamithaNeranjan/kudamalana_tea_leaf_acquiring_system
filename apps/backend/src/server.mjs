import http from "node:http";
import { pathToFileURL } from "node:url";
import { buildGreenLeafBook } from "../../../packages/shared/src/index.mjs";
import { createMemoryStore } from "./store.mjs";
import { createMySqlStore, loadBackendEnv } from "./mysqlStore.mjs";

export function createBackendServer({ store = createMemoryStore() } = {}) {
  async function parseBody(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (chunks.length === 0) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }

  function corsHeaders(request) {
    const origin = request.headers.origin;
    return {
      "access-control-allow-origin": origin || "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
      vary: "Origin"
    };
  }

  function send(request, response, status, payload, headers = {}) {
    response.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(request),
      ...headers
    });
    response.end(JSON.stringify(payload));
  }

  function bearer(request) {
    const header = request.headers.authorization || "";
    return header.startsWith("Bearer ") ? header.slice(7) : "";
  }

  function cookieToken(request) {
    const cookies = Object.fromEntries(
      String(request.headers.cookie || "")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const index = part.indexOf("=");
          return index === -1
            ? [part, ""]
            : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
        })
    );
    return cookies.tea_session || "";
  }

  function sessionToken(request) {
    return bearer(request) || cookieToken(request);
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
        const payload = await parseBody(request);
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
        return send(request, response, 201, await store.createUser(sessionToken(request), await parseBody(request)));
      }
      if (request.method === "PATCH" && url.pathname.startsWith("/admin/users/")) {
        const userId = decodeURIComponent(url.pathname.split("/").pop());
        return send(request, response, 200, await store.updateUser(sessionToken(request), userId, await parseBody(request)));
      }
      if (request.method === "GET" && url.pathname === "/admin/directors") {
        return send(request, response, 200, { directors: await store.listDirectors(sessionToken(request)) });
      }
      if (request.method === "POST" && url.pathname === "/admin/directors") {
        return send(request, response, 201, await store.createDirector(sessionToken(request), await parseBody(request)));
      }
      if (request.method === "POST" && url.pathname === "/sync/desktop") {
        return send(request, response, 200, await store.syncFromDesktop(sessionToken(request), await parseBody(request)));
      }
      if (request.method === "GET" && url.pathname === "/green-leaf-book") {
        const month = url.searchParams.get("month");
        const input = await store.getGreenLeafInput(sessionToken(request), month);
        return send(request, response, 200, buildGreenLeafBook(input));
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
