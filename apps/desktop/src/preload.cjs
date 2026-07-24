const { contextBridge } = require("electron");
const QRCode = require("qrcode");

contextBridge.exposeInMainWorld("teaDesktop", {
  apiBaseUrl: `http://127.0.0.1:${process.env.DESKTOP_SYNC_PORT || 7070}`,
  createQrDataUrl: (text) =>
    QRCode.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 260,
      color: {
        dark: "#17351F",
        light: "#FFFFFF"
      }
    })
});
