const apiHost = window.location.hostname || "localhost";
export const apiUrl = `http://${apiHost}:8080`;

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
