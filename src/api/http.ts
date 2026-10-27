/** Minimal JSON client for /api/v1 used by the SPA stores. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export async function api<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  options: { query?: Query; body?: unknown } = {},
): Promise<T> {
  const url = new URL(`/api/v1${path}`, location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== "")
      url.searchParams.set(key, String(value));
  }
  const init: RequestInit = { method, credentials: "same-origin" };
  if (options.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  return send<T>(url, init);
}

/** Multipart upload; the browser sets the boundary header itself. */
export function upload<T>(path: string, form: FormData): Promise<T> {
  return send<T>(new URL(`/api/v1${path}`, location.origin), {
    method: "POST",
    credentials: "same-origin",
    body: form,
  });
}

async function send<T>(url: URL, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError(0, "NETWORK", "Network error");
  }
  const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    if (response.status === 401) {
      // Session expired: send the user back to sign-in.
      location.assign("/login");
    }
    throw new ApiError(
      response.status,
      error?.code ?? `HTTP_${response.status}`,
      error?.message ?? response.statusText,
      error?.details,
    );
  }
  return payload as T;
}
