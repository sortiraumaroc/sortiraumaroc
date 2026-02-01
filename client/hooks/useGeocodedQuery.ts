import * as React from "react";

import { useEffect, useRef, useState } from "react";

import type { LatLng } from "@/lib/geo";
import { geocodeNominatimCached } from "@/lib/geo";

type GeocodeState =
  | { status: "idle"; coords: null }
  | { status: "loading"; coords: null }
  | { status: "success"; coords: LatLng }
  | { status: "error"; coords: null };

export function useGeocodedQuery(query: string) {
  const [state, setState] = useState<GeocodeState>({ status: "idle", coords: null });
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      requestIdRef.current += 1;
      setState({ status: "idle", coords: null });
      return;
    }

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    let cancelled = false;
    setState({ status: "loading", coords: null });

    // We intentionally avoid aborting on cleanup because some environments surface
    // AbortErrors during effect unmount as noisy runtime errors.
    const controller = new AbortController();

    void geocodeNominatimCached(trimmed, controller.signal)
      .then((coords) => {
        if (cancelled) return;
        if (requestId !== requestIdRef.current) return;

        if (!coords) {
          setState({ status: "error", coords: null });
          return;
        }

        setState({ status: "success", coords });
      })
      .catch(() => {
        if (cancelled) return;
        if (requestId !== requestIdRef.current) return;
        setState({ status: "error", coords: null });
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  return state;
}
