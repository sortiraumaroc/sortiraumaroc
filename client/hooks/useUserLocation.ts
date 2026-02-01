import * as React from "react";

import type { LatLng } from "@/lib/geo";

type GeoStatus = "idle" | "requesting" | "available" | "denied" | "unsupported";

export function useUserLocation() {
  const [status, setStatus] = React.useState<GeoStatus>("idle");
  const [location, setLocation] = React.useState<LatLng | null>(null);

  const request = React.useCallback(() => {
    if (!navigator.geolocation) {
      setStatus("unsupported");
      return;
    }

    setStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setStatus("available");
      },
      () => {
        setLocation(null);
        setStatus("denied");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const maybeAutoRequest = async () => {
      if (!navigator.geolocation) {
        if (!cancelled) setStatus("unsupported");
        return;
      }

      const permissions = (navigator as any).permissions as Permissions | undefined;
      if (!permissions?.query) return;

      try {
        const result = await permissions.query({ name: "geolocation" as PermissionName });
        if (cancelled) return;
        if (result.state === "granted") {
          request();
        } else if (result.state === "denied") {
          setStatus("denied");
        }
      } catch {
        // Ignore; manual request is still available.
      }
    };

    void maybeAutoRequest();

    return () => {
      cancelled = true;
    };
  }, [request]);

  return { status, location, request };
}
