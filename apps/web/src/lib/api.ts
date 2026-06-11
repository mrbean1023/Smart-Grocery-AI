/**
 * Typed API client for the Smart Grocery backend.
 * - Client side: token resolved via next-auth getSession() (cached briefly).
 * - Server side: pass `token` explicitly (obtain via auth()).
 */

const BASE_URL =
  (typeof window === "undefined"
    ? process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL
    : process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:4000/v1";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type Query = Record<string, string | number | boolean | undefined | null | string[]>;

export interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Multipart body — overrides `body` and skips the JSON content-type. */
  formData?: FormData;
  /** Server-side access token. When omitted on the client, getSession() is used. */
  token?: string | null;
  query?: Query;
  signal?: AbortSignal;
  /** Skip the Authorization header entirely (public endpoints). */
  anonymous?: boolean;
}

let tokenCache: { token: string | null; fetchedAt: number } | null = null;

/** Invalidate the cached access token (e.g. after sign-in/out). */
export function clearTokenCache() {
  tokenCache = null;
}

async function getClientToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const now = Date.now();
  if (tokenCache && now - tokenCache.fetchedAt < 30_000) return tokenCache.token;
  const { getSession } = await import("next-auth/react");
  const session = await getSession();
  tokenCache = { token: session?.accessToken ?? null, fetchedAt: now };
  return tokenCache.token;
}

function buildQuery(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      params.set(key, value.join(","));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, formData, query, signal, anonymous } = opts;

  const headers: Record<string, string> = {};
  if (!formData && body !== undefined) headers["Content-Type"] = "application/json";

  if (!anonymous) {
    const token = opts.token !== undefined ? opts.token : await getClientToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}${buildQuery(query)}`, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "Cannot reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err = (data ?? {}) as { statusCode?: number; message?: string | string[]; code?: string };
    const message = Array.isArray(err.message)
      ? err.message.join(", ")
      : err.message ?? `Request failed (${res.status})`;
    throw new ApiError(err.statusCode ?? res.status, message, err.code);
  }

  return data as T;
}
