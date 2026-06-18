import http from "node:http";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { pathToFileURL } from "node:url";
import QRCode from "qrcode";
import { buildGreenLeafBook, suggestAdvancePayment } from "../../../packages/shared/src/index.mjs";
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
          const updatedUser = await store.updateOfficeProfile(session.user.id, await body(request));
          session.user = updatedUser;
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
