// src/lib/fetch.ts
// Central fetch wrapper — adds ngrok bypass header automatically so pages
// don't show "ngrok browser warning" HTML instead of JSON responses.

const API = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

const NGROK_HEADERS: Record<string, string> = {
  "ngrok-skip-browser-warning": "1",
};

/**
 * Drop-in replacement for fetch() that always includes the ngrok bypass header.
 * Use apiFetch("/api/complaints") — the leading slash is optional.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${API}${path.startsWith("/") ? "" : "/"}${path}`;

  const headers = new Headers(options.headers ?? {});
  headers.set("ngrok-skip-browser-warning", "1");

  // Preserve Content-Type if caller set it
  return fetch(url, { ...options, headers });
}

/**
 * GET helper — returns parsed JSON directly.
 */
export async function apiGet<T = any>(path: string): Promise<T> {
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}

/**
 * POST / PATCH / DELETE helpers.
 */
export async function apiPost<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await apiFetch(path, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}`);
  return r.json();
}

export async function apiPatch<T = any>(path: string, body: unknown): Promise<T> {
  const r = await apiFetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}`);
  return r.json();
}

export async function apiDelete(path: string): Promise<void> {
  const r = await apiFetch(path, { method: "DELETE" });
  if (!r.ok) throw new Error(`DELETE ${path} → ${r.status}`);
}

export { API };
