/** Browser-side helpers for our own /api routes. Messages are safe to show. */
export class ApiError extends Error {
  constructor(
    message: string,
    /** The route's error code, or "network" if it never answered. */
    public readonly code?: string
  ) {
    super(message);
  }
}

async function request<T>(
  url: string,
  init: RequestInit,
  signal?: AbortSignal
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("Could not reach the app server.", "network");
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      body?.error?.message ?? "Something went wrong.",
      body?.error?.code
    );
  }
  return body as T;
}

export const fetchJson = <T>(url: string, signal?: AbortSignal) =>
  request<T>(url, {}, signal);

export const postForm = <T>(url: string, form: FormData, signal?: AbortSignal) =>
  request<T>(url, { method: "POST", body: form }, signal);

export const postJson = <T>(url: string, body: unknown, signal?: AbortSignal) =>
  request<T>(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    signal
  );

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}
