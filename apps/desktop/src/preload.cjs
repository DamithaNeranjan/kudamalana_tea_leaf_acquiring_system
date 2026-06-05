const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("teaDesktop", {
  apiBaseUrl: "http://127.0.0.1:7070"
});
