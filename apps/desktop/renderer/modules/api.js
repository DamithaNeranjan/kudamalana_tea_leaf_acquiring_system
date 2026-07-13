export function createApi({ baseUrl, getOfficeToken }) {
  return async function api(path, options = {}) {
    const token = getOfficeToken();
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      ...options
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Request failed");
    return payload;
  };
}
