import { app, BrowserWindow } from "electron";
import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { join } from "node:path";

let syncProcess;

function startSyncServer() {
  const appPath = app.getAppPath();
  const dataDir = join(appPath, "desktop-data");
  mkdirSync(dataDir, { recursive: true });
  const logFile = openSync(join(dataDir, "sync-server.log"), "a");
  const nodeCommand = process.platform === "win32" ? "node.exe" : "node";
  syncProcess = spawn(nodeCommand, [join(appPath, "src", "server.mjs")], {
    cwd: appPath,
    env: { ...process.env, DESKTOP_SYNC_PORT: "7070" },
    stdio: ["ignore", logFile, logFile],
    windowsHide: true
  });
  syncProcess.unref();
}

async function createWindow() {
  startSyncServer();
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    webPreferences: {
      preload: join(app.getAppPath(), "src", "preload.cjs")
    }
  });

  await window.loadFile(join(app.getAppPath(), "renderer", "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (syncProcess && !syncProcess.killed) syncProcess.kill();
  if (process.platform !== "darwin") app.quit();
});
