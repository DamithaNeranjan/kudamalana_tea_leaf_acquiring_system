import { app, BrowserWindow, dialog } from "electron";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalStore } from "./localStore.mjs";
import { createDesktopSyncServer } from "./server.mjs";

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(desktopRoot));
const desktopSyncPort = Number(process.env.DESKTOP_SYNC_PORT || 7070);
let syncServer;

function desktopDataDir() {
  const dataDir = process.env.DESKTOP_DATA_DIR || join(app.getPath("userData"), "desktop-data");
  mkdirSync(dataDir, { recursive: true });
  process.env.DESKTOP_DATA_DIR = dataDir;
  return dataDir;
}

async function startSyncServer() {
  const dataDir = desktopDataDir();
  const store = new LocalStore(join(dataDir, "tea-local-db.sqlite"));
  syncServer = await createDesktopSyncServer({ store });
  await new Promise((resolve, reject) => {
    syncServer.once("error", reject);
    syncServer.listen(desktopSyncPort, "0.0.0.0", () => {
      syncServer.off("error", reject);
      resolve();
    });
  });
}

async function stopSyncServer() {
  if (!syncServer?.listening) return;
  await new Promise((resolve) => syncServer.close(resolve));
}

async function createWindow() {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.kudamalana.tea-office");
  }
  await startSyncServer();
  const iconPath = join(repositoryRoot, "apps", "logo", "KudamalanaLogo1.png");
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    icon: iconPath,
    webPreferences: {
      preload: join(desktopRoot, "src", "preload.cjs"),
      sandbox: false
    }
  });

  await window.loadFile(join(desktopRoot, "renderer", "index.html"));
}

app.whenReady().then(createWindow).catch((error) => {
  dialog.showErrorBox("Tea Leaf Acquiring System could not start", error.message);
  app.quit();
});

app.on("window-all-closed", async () => {
  await stopSyncServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (syncServer?.listening) syncServer.close();
});
