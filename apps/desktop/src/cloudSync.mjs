export function configuredBackendUrl(payload, env = process.env) {
  return String(payload.backendUrl || env.BACKEND_URL || "").replace(/\/$/, "");
}

export function configuredBackendToken(payload, env = process.env) {
  return String(payload.backendToken || env.CLOUD_SYNC_TOKEN || env.DESKTOP_CLOUD_SYNC_TOKEN || "");
}

export async function resolveBackendToken({ payload, backendUrl, fetchImpl = fetch, env = process.env }) {
  let backendToken = configuredBackendToken(payload, env);
  if (backendToken || !payload.username || !payload.password) return backendToken;

  const loginResponse = await fetchImpl(`${backendUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: payload.username, password: payload.password })
  });
  const loginPayload = await loginResponse.json();
  if (!loginResponse.ok) {
    const error = new Error(loginPayload.error || "Backend login failed");
    error.status = loginResponse.status;
    throw error;
  }
  return loginPayload.token;
}

export function sentCounts(syncPayload) {
  return Object.fromEntries(
    Object.entries(syncPayload)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => [key, value.length])
  );
}

export function beginCloudSyncPlan(store, payload, backendUrl) {
  const lastSuccessfulSync = store.lastSuccessfulCloudSync();
  const cursorFrom = payload.fullSync ? "" : lastSuccessfulSync?.cursorTo || "";
  const cursorTo = new Date().toISOString();
  const syncPayload = store.exportChangedGreenLeafBookSyncData({
    since: cursorFrom,
    full: Boolean(payload.fullSync),
    cursorTo,
    includeOfficeUsers: payload.syncOfficeUsers === true
  });
  const counts = sentCounts(syncPayload);
  const syncRun = store.beginCloudSyncRun({
    mode: syncPayload.sync.mode,
    backendUrl,
    cursorFrom,
    cursorTo,
    sent: counts
  });
  return { cursorFrom, cursorTo, syncPayload, sentCounts: counts, syncRun };
}
