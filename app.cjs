"use strict";

let server;
let store;

async function startBackend() {
  try {
    const { createBackendServer } = await import("./apps/backend/src/server.mjs");
    const { createMySqlStore, loadBackendEnv } = await import("./apps/backend/src/mysqlStore.mjs");

    await loadBackendEnv(process.cwd());
    const port = Number(process.env.PORT || 8080);
    store = await createMySqlStore();
    server = createBackendServer({ store });
    server.listen(port, () => {
      console.log(`Tea backend listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

async function shutdown() {
  if (!server) process.exit(0);
  server.close(async () => {
    await store?.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startBackend();

module.exports = {};
