import http from "node:http";
import { pathToFileURL } from "node:url";
import { buildGreenLeafBook, suggestAdvancePayment } from "../../../packages/shared/src/index.mjs";
import { LocalStore } from "./localStore.mjs";

export async function createDesktopSyncServer({ store = new LocalStore() } = {}) {
  await store.load();

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
      if (request.method === "POST" && url.pathname === "/sync/collections") {
        const payload = await body(request);
        return send(response, 200, await store.importCollections(payload.deviceId, payload.records));
      }
      if (request.method === "GET" && url.pathname.startsWith("/sync/status/")) {
        return send(response, 200, { deviceId: url.pathname.split("/").pop(), ready: true });
      }
      if (request.method === "POST" && url.pathname === "/office/login") {
        const payload = await body(request);
        return send(response, 200, store.login(payload.username, payload.password));
      }
      if (request.method === "POST" && url.pathname === "/office/line-users") {
        return send(response, 201, await store.upsert("lineUsers", await body(request), "line_user"));
      }
      if (request.method === "POST" && url.pathname === "/office/tea-lines") {
        return send(response, 201, await store.upsert("teaLines", await body(request), "line"));
      }
      if (request.method === "POST" && url.pathname === "/office/suppliers") {
        return send(response, 201, await store.upsert("suppliers", await body(request), "sup"));
      }
      if (request.method === "POST" && url.pathname === "/office/monthly-settings") {
        return send(response, 201, await store.upsert("monthlySettings", await body(request), "settings"));
      }
      if (request.method === "PUT" && url.pathname.startsWith("/office/staging/")) {
        return send(response, 200, await store.updateStaging(url.pathname.split("/").pop(), await body(request)));
      }
      if (request.method === "POST" && url.pathname.endsWith("/post") && url.pathname.startsWith("/office/staging/")) {
        return send(response, 200, await store.postStaging(url.pathname.split("/").at(-2)));
      }
      if (request.method === "GET" && url.pathname === "/office/state") {
        return send(response, 200, store.data);
      }
      if (request.method === "GET" && url.pathname === "/office/green-leaf-book") {
        const month = url.searchParams.get("month");
        const exported = store.exportForCloud();
        return send(response, 200, buildGreenLeafBook({ month, ...exported, entries: exported.collectionEntries }));
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
