import * as React from "react";

import type { GeoFenceConfig } from "@/hooks/use-geo-fence";
import { getSupabaseClient, SAM_ESTABLISHMENT_ID } from "@/lib/supabase";

type EstablishmentGeoFenceRow = {
  lat: number | null;
  lng: number | null;
  geo_fence_enabled: boolean | null;
  geo_fence_radius_meters: number | null;
};

type EstablishmentGeoFenceResult = {
  config: GeoFenceConfig;
  loading: boolean;
};

export function useEstablishmentGeoFence(fallback: GeoFenceConfig): EstablishmentGeoFenceResult {
  const [config, setConfig] = React.useState<GeoFenceConfig>(fallback);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    async function load() {
      const establishmentId = SAM_ESTABLISHMENT_ID;
      if (!establishmentId) {
        if (mounted) {
          setConfig(fallback);
          setLoading(false);
        }
        return;
      }

      try {
        const supabase = getSupabaseClient();
        const res = await supabase
          .from("establishments")
          .select("lat, lng, geo_fence_enabled, geo_fence_radius_meters")
          .eq("id", establishmentId)
          .maybeSingle();

        if (!mounted) return;

        if (res.error || !res.data) {
          setConfig(fallback);
          setLoading(false);
          return;
        }

        const row = res.data as EstablishmentGeoFenceRow;
        setConfig({
          enabled: row.geo_fence_enabled ?? fallback.enabled,
          latitude: row.lat ?? fallback.latitude,
          longitude: row.lng ?? fallback.longitude,
          radiusMeters: row.geo_fence_radius_meters ?? fallback.radiusMeters,
        });
        setLoading(false);
      } catch {
        if (!mounted) return;
        setConfig(fallback);
        setLoading(false);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []); // Empty dependency array: effect runs only once on mount

  return { config, loading };
}
