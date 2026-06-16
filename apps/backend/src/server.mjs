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

  function send(response, status, payload) {
    response.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    });
    response.end(JSON.stringify(payload));
  }

  function bearer(request) {
    const header = request.headers.authorization || "";
    return header.startsWith("Bearer ") ? header.slice(7) : "";
  }

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "OPTIONS") return send(response, 204, {});
      if (request.method === "GET" && url.pathname === "/health") {
        return send(response, 200, { ok: true, service: "tea-backend" });
      }
      if (request.method === "POST" && url.pathname === "/auth/login") {
        const payload = await parseBody(request);
        return send(response, 200, await store.login(payload.username, payload.password));
      }
      if (request.method === "POST" && url.pathname === "/auth/logout") {
        return send(response, 200, await store.logout(bearer(request)));
      }
      if (request.method === "POST" && url.pathname === "/admin/directors") {
        return send(response, 201, await store.createDirector(bearer(request), await parseBody(request)));
      }
      if (request.method === "POST" && url.pathname === "/sync/desktop") {
        return send(response, 200, await store.syncFromDesktop(bearer(request), await parseBody(request)));
      }
      if (request.method === "GET" && url.pathname === "/green-leaf-book") {
        const month = url.searchParams.get("month");
        const input = await store.getGreenLeafInput(bearer(request), month);
        return send(response, 200, buildGreenLeafBook(input));
      }
      return send(response, 404, { error: "Not found" });
    } catch (error) {
      return send(response, error.status || 500, { error: error.message || "Internal server error" });
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
