import * as React from "react";

export type GeoFenceConfig = {
  enabled?: boolean;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

export type GeoFenceState =
  | { status: "idle" }
  | { status: "requesting" }
  | {
      status: "ready";
      distanceMeters: number;
      inside: boolean;
      coords: { latitude: number; longitude: number; accuracy: number | null };
    }
  | { status: "denied" }
  | { status: "unsupported" }
  | { status: "error"; message: string };

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371e3;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return R * c;
}

export function useGeoFence(config: GeoFenceConfig) {
  const [state, setState] = React.useState<GeoFenceState>({ status: "idle" });

  const request = React.useCallback(() => {
    if (config.enabled === false) {
      setState({
        status: "ready",
        distanceMeters: 0,
        inside: true,
        coords: {
          latitude: config.latitude,
          longitude: config.longitude,
          accuracy: null,
        },
      });
      return;
    }

    if (!navigator.geolocation) {
      setState({ status: "unsupported" });
      return;
    }

    setState({ status: "requesting" });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        const accuracy = Number.isFinite(pos.coords.accuracy)
          ? pos.coords.accuracy
          : null;

        const distanceMeters = haversineMeters(
          latitude,
          longitude,
          config.latitude,
          config.longitude,
        );

        // GPS is often imprecise indoors. Use the reported accuracy to avoid
        // false negatives by accepting the best-case distance.
        const accuracyMeters = accuracy ?? 0;
        const bestCaseDistanceMeters = Math.max(0, distanceMeters - accuracyMeters);
        const inside = bestCaseDistanceMeters <= config.radiusMeters;

        setState({
          status: "ready",
          distanceMeters,
          inside,
          coords: { latitude, longitude, accuracy },
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState({ status: "denied" });
          return;
        }
        setState({ status: "error", message: err.message || "Erreur GPS" });
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 5000,
      },
    );
  }, [config.enabled, config.latitude, config.longitude, config.radiusMeters]);

  React.useEffect(() => {
    request();
  }, [request]);

  return { state, request };
}
