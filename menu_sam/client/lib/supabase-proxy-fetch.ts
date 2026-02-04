type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

type FetchLike = (input: FetchInput, init?: FetchInit) => ReturnType<typeof fetch>;

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function getUrlString(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/**
 * In some embedded/preview environments, direct browser requests to *.supabase.co can fail.
 * This fetch wrapper rewrites Supabase HTTP calls to a same-origin proxy route:
 *   https://<project>.supabase.co/rest/v1/...   ->  /api/supabase/rest/v1/...
 */
export function createSupabaseProxyFetch(rawSupabaseUrl: string): FetchLike {
  const supabaseUrl = stripTrailingSlash(rawSupabaseUrl);
  const nativeFetch = globalThis.fetch.bind(globalThis);

  return (input: FetchInput, init?: FetchInit) => {
    const originalUrl = getUrlString(input);

    if (!originalUrl.startsWith(supabaseUrl)) {
      return nativeFetch(input as any, init as any);
    }

    const pathAndQuery = originalUrl.slice(supabaseUrl.length);
    const proxiedUrl = `/api/supabase${pathAndQuery}`;

    // If Supabase passes a Request, clone it into a new Request pointing to the proxy.
    if (input instanceof Request) {
      const req = new Request(proxiedUrl, input);
      return nativeFetch(req);
    }

    return nativeFetch(proxiedUrl, init);
  };
}
