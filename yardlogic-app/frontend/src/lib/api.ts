export const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:4000" : "");
if (!import.meta.env.DEV && !API_BASE_URL) {
  console.error("VITE_API_URL is missing from the production frontend build. API requests would target the frontend origin.");
}
const REQUEST_TIMEOUT_MS = 15000;
const AI_REQUEST_TIMEOUT_MS = 50000;
const MAX_GET_RETRIES = 2;

function getToken() {
  return localStorage.getItem("token");
}
function getBusinessId() {
  return localStorage.getItem("businessId");
}
function getApplicationId() {
  const configured = import.meta.env.VITE_APPLICATION_ID === "IBIM" || import.meta.env.VITE_APPLICATION_ID === "YARDLOGIC"
    ? import.meta.env.VITE_APPLICATION_ID
    : "";
  return configured || localStorage.getItem("applicationPreference") || "";
}

async function parseJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("json")) {
    throw new Error(`API request to ${API_BASE_URL || window.location.origin} returned ${contentType || "a non-JSON response"}. Check the deployment API URL.`);
  }
  try {
    return await res.json() as T;
  } catch {
    throw new Error(`API request to ${API_BASE_URL || window.location.origin} returned invalid JSON. Check the deployment API URL.`);
  }
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
      const res = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        signal,
        headers: {
          ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
          ...(getBusinessId() ? { "X-Business-Id": getBusinessId()! } : {}),
          ...(getApplicationId() ? { "X-Application-Id": getApplicationId() } : {}),
          ...options.headers,
        },
      });

      if (!res.ok) {
        const body = await parseJson<Record<string, any>>(res).catch(() => ({} as Record<string, any>));
        const message = typeof body.error === "string"
          ? body.error
          : body.error?.message || (res.status === 405
            ? `The API target ${API_BASE_URL || window.location.origin} rejected POST /auth/login. Redeploy the frontend with VITE_API_URL set to the backend URL.`
            : `Request failed: ${res.status}`);
        throw new Error(message);
      }

      return await parseJson<T>(res);
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        if (attempt === retries) throw new Error("The server took too long to respond. Please try again.");
      } else if (error instanceof TypeError) {
        if (attempt === retries) throw new Error(`Unable to reach the server at ${API_BASE_URL || "the configured API"}. Check the deployment API URL and try again.`);
      } else {
        throw error;
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed. Please try again.");
}

export async function downloadFile(path: string, filename: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(getBusinessId() ? { "X-Business-Id": getBusinessId()! } : {}),
      ...(getApplicationId() ? { "X-Application-Id": getApplicationId() } : {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" ? body.error : `Download failed: ${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
