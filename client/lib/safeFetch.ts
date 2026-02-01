type XhrFetchInit = RequestInit & { timeoutMs?: number };

function headersFrom(init: HeadersInit | undefined): Headers {
  if (!init) return new Headers();
  return new Headers(init);
}

function isAbortError(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as any).name === "AbortError";
}

function makeFailedToFetchError(args: {
  url: string;
  method: string;
  reason: "network" | "timeout" | "open" | "send" | "unknown";
  cause?: unknown;
}): TypeError {
  const label = args.reason === "timeout" ? "Request timed out" : "Failed to fetch";
  const message = `${label} (${args.method.toUpperCase()} ${args.url})`;

  const err = new TypeError(message) as TypeError & { cause?: unknown };
  if (args.cause !== undefined) err.cause = args.cause;
  return err;
}

async function readRequestBody(input: RequestInfo | URL, init?: RequestInit): Promise<BodyInit | null | undefined> {
  if (init && "body" in init) return init.body as BodyInit | null | undefined;
  if (typeof Request !== "undefined" && input instanceof Request) {
    const method = (init?.method ?? input.method ?? "GET").toUpperCase();
    if (method === "GET" || method === "HEAD") return undefined;
    try {
      return await input.clone().arrayBuffer();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function urlFrom(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (typeof URL !== "undefined" && input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

function methodFrom(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method;
  if (typeof Request !== "undefined" && input instanceof Request) return input.method;
  return "GET";
}

function mergeHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const h = headersFrom(init?.headers);
  if (typeof Request !== "undefined" && input instanceof Request) {
    input.headers.forEach((value, key) => {
      if (!h.has(key)) h.set(key, value);
    });
  }
  return h;
}

export async function xhrFetch(input: RequestInfo | URL, init?: XhrFetchInit): Promise<Response> {
  const url = urlFrom(input);
  const method = methodFrom(input, init);
  const headers = mergeHeaders(input, init);
  const body = await readRequestBody(input, init);

  const timeoutMs = typeof init?.timeoutMs === "number" && Number.isFinite(init.timeoutMs) ? Math.max(1, init.timeoutMs) : 0;

  return await new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    try {
      xhr.open(method, url, true);
    } catch (e) {
      reject(makeFailedToFetchError({ url, method, reason: "open", cause: e }));
      return;
    }

    xhr.responseType = "arraybuffer";

    if (init?.credentials === "include") {
      xhr.withCredentials = true;
    }

    headers.forEach((value, key) => {
      try {
        xhr.setRequestHeader(key, value);
      } catch {
        // ignore invalid headers
      }
    });

    if (timeoutMs) xhr.timeout = timeoutMs;

    const onAbortSignal = () => {
      try {
        xhr.abort();
      } catch {
        // ignore
      }
    };

    if (init?.signal) {
      if (init.signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      init.signal.addEventListener("abort", onAbortSignal, { once: true });
    }

    xhr.onload = () => {
      if (init?.signal) init.signal.removeEventListener("abort", onAbortSignal);

      const rawHeaders = xhr.getAllResponseHeaders() || "";
      const responseHeaders = new Headers();
      for (const line of rawHeaders.trim().split(/\r?\n/)) {
        if (!line) continue;
        const idx = line.indexOf(":");
        if (idx === -1) continue;
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (!k) continue;
        responseHeaders.append(k, v);
      }

      resolve(
        new Response(xhr.response, {
          status: xhr.status || 0,
          statusText: xhr.statusText,
          headers: responseHeaders,
        }),
      );
    };

    xhr.onerror = () => {
      if (init?.signal) init.signal.removeEventListener("abort", onAbortSignal);
      reject(makeFailedToFetchError({ url, method, reason: "network" }));
    };

    xhr.ontimeout = () => {
      if (init?.signal) init.signal.removeEventListener("abort", onAbortSignal);
      reject(makeFailedToFetchError({ url, method, reason: "timeout" }));
    };

    xhr.onabort = () => {
      if (init?.signal) init.signal.removeEventListener("abort", onAbortSignal);
      reject(new DOMException("Aborted", "AbortError"));
    };

    try {
      xhr.send(body as any);
    } catch (e) {
      if (init?.signal) init.signal.removeEventListener("abort", onAbortSignal);
      reject(makeFailedToFetchError({ url, method, reason: "send", cause: e }));
    }
  });
}

function isFailedToFetch(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  return msg.toLowerCase().includes("failed to fetch") && !isAbortError(e);
}

/**
 * Replacement for window.fetch that falls back to XHR when fetch is blocked/broken.
 * This is useful in some sandbox/iframe environments where fetch is proxied.
 */
export async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const native = (globalThis as any).__sam_native_fetch as typeof fetch | undefined;
  const candidate = native && native !== safeFetch ? native : null;

  if (candidate) {
    try {
      return await candidate(input as any, init);
    } catch (e) {
      if (!isFailedToFetch(e)) throw e;
      try {
        return await xhrFetch(input, init);
      } catch (xhrError) {
        const url = urlFrom(input);
        const method = methodFrom(input, init);
        throw makeFailedToFetchError({ url, method, reason: "network", cause: xhrError });
      }
    }
  }

  try {
    return await xhrFetch(input, init);
  } catch (e) {
    const url = urlFrom(input);
    const method = methodFrom(input, init);
    throw makeFailedToFetchError({ url, method, reason: "network", cause: e });
  }
}

export function installSafeFetch(): void {
  if (typeof window === "undefined") return;
  const w = window as any;

  if (!w.__sam_native_fetch) {
    try {
      w.__sam_native_fetch = window.fetch?.bind(window);
    } catch {
      w.__sam_native_fetch = null;
    }
  }

  window.fetch = safeFetch as any;
}
