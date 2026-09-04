const BASE_URL = import.meta.env.VITE_API_URL || (
  import.meta.env.DEV ? "http://localhost:4000" : "https://yardlogic-backend.vercel.app"
);
const REQUEST_TIMEOUT_MS = 15000;
const AI_REQUEST_TIMEOUT_MS = 50000;
const MAX_GET_RETRIES = 2;

function getToken() {
  return localStorage.getItem("token");
}
function getBusinessId() {
  return localStorage.getItem("businessId");
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const requestTimeoutMs = path.startsWith("/ai/") ? AI_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const canRetry = method === "GET" || method === "HEAD" || method === "OPTIONS";
  const retries = canRetry ? MAX_GET_RETRIES : 0;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);
    const signal = options.signal || controller.signal;

    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        signal,
        headers: {
          ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
          ...(getBusinessId() ? { "X-Business-Id": getBusinessId()! } : {}),
          ...options.headers,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = typeof body.error === "string"
          ? body.error
          : body.error?.message || `Request failed: ${res.status}`;
        throw new Error(message);
      }

      return await res.json();
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        if (attempt === retries) throw new Error("The server took too long to respond. Please try again.");
      } else if (error instanceof TypeError) {
        if (attempt === retries) throw new Error("Unable to reach the server. Check your connection and try again.");
      } else {
        throw error;
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed. Please try again.");
}
