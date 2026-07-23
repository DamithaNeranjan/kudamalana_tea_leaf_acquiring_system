const env = import.meta.env || {};

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function defaultApiUrl() {
  if (typeof window === "undefined") return "http://localhost:8080";
  const apiPort = env.VITE_API_PORT || "8080";
  const { hostname, origin, port, protocol } = window.location;
  if (!port || port === "80" || port === "443") return origin;
  return `${protocol}//${hostname || "localhost"}:${apiPort}`;
}

const runtimeApiUrl = typeof window === "undefined" ? "" : window.__TEA_API_URL__;

export const apiUrl = cleanUrl(env.VITE_API_URL || runtimeApiUrl || defaultApiUrl());

export async function request(path, options = {}) {
  const { headers = {}, ...rest } = options;
  let response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...headers
      },
      ...rest
    });
  } catch (error) {
    throw new Error(`Cannot connect to backend at ${apiUrl}. Start the backend and try again.`);
  }

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}
