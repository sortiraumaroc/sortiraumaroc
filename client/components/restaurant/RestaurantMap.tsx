import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from "@react-google-maps/api";

import { useGeocodedQuery } from "@/hooks/useGeocodedQuery";
import { cn } from "@/lib/utils";
import { GOOGLE_MAPS_API_KEY, DEFAULT_MAP_CENTER, defaultMapOptions } from "@/lib/googleMaps";

type LatLng = { lat: number; lng: number };

const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

// Logo source — will be drawn inside a round marker via canvas
const SAM_LOGO_SRC = "/Logo_SAM_Megaphone_Blanc.png";
const MARKER_SIZE = 56; // px (canvas resolution, displayed at ~44-48 CSS px)

/**
 * Creates a round marker icon as a data-URL by drawing the SAM logo
 * inside a circular red background with a white border.
 */
function createRoundMarkerIcon(): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = MARKER_SIZE;
      canvas.height = MARKER_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas 2d context unavailable")); return; }

      const cx = MARKER_SIZE / 2;
      const cy = MARKER_SIZE / 2;
      const r = MARKER_SIZE / 2 - 2; // leave 2px for border

      // Red circle background
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#E53935";
      ctx.fill();

      // Clip to circle for the logo
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
      ctx.clip();

      // Draw the logo centered and covering the circle
      const logoSize = (r - 2) * 2;
      ctx.drawImage(img, cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize);
      ctx.restore();

      // White border ring
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      // Fallback: return empty so we use default Google marker
      resolve("");
    };
    img.src = SAM_LOGO_SRC;
  });
}

// Module-level cache so we only generate the icon once
let _cachedMarkerUrl: string | null = null;
let _markerPromise: Promise<string> | null = null;

function useRoundMarkerIcon(): string | null {
  const [url, setUrl] = useState<string | null>(_cachedMarkerUrl);

  useEffect(() => {
    if (_cachedMarkerUrl) { setUrl(_cachedMarkerUrl); return; }
    if (!_markerPromise) _markerPromise = createRoundMarkerIcon();
    _markerPromise.then((dataUrl) => {
      _cachedMarkerUrl = dataUrl || null;
      setUrl(_cachedMarkerUrl);
    });
  }, []);

  return url;
}

export function RestaurantMap({
  query,
  name,
  lat,
  lng,
  className,
  heightClassName = "h-96",
}: {
  query: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  className?: string;
  heightClassName?: string;
}) {
  // Use direct coordinates if provided, otherwise fallback to geocoding
  const hasDirectCoords = typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng);
  const geocode = useGeocodedQuery(hasDirectCoords ? "" : query); // Skip geocoding if we have direct coords
  const mapRef = useRef<google.maps.Map | null>(null);
  const [showInfoWindow, setShowInfoWindow] = useState(false);
  const roundMarkerUrl = useRoundMarkerIcon();

  // Prioritize direct coordinates over geocoded ones
  const coords: LatLng = hasDirectCoords
    ? { lat: lat!, lng: lng! }
    : geocode.status === "success"
      ? geocode.coords
      : DEFAULT_MAP_CENTER;
  const showMarker = hasDirectCoords || geocode.status === "success";

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Center map when coords change
  useEffect(() => {
    if (mapRef.current && (hasDirectCoords || geocode.status === "success")) {
      mapRef.current.panTo(coords);
      const currentZoom = mapRef.current.getZoom() ?? 14;
      if (currentZoom < 15) {
        mapRef.current.setZoom(15);
      }
    }
  }, [coords, geocode.status, hasDirectCoords]);

  if (loadError) {
    return (
      <div className={cn("rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center", heightClassName, className)}>
        <p className="text-slate-500">Erreur de chargement de la carte</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={cn("rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center", heightClassName, className)}>
        <div className="animate-pulse text-slate-500">Chargement de la carte...</div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border border-slate-200 overflow-hidden bg-slate-50", heightClassName, className)}>
      <div className="relative w-full h-full">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={coords}
          zoom={14}
          options={defaultMapOptions}
          onLoad={onMapLoad}
        >
          {showMarker && (
            <>
              <Marker
                position={coords}
                onClick={() => setShowInfoWindow(true)}
                {...(roundMarkerUrl ? {
                  icon: {
                    url: roundMarkerUrl,
                    scaledSize: new google.maps.Size(46, 46),
                    anchor: new google.maps.Point(23, 23),
                  },
                } : {})}
              />

              {showInfoWindow && (
                <InfoWindow
                  position={coords}
                  onCloseClick={() => setShowInfoWindow(false)}
                  options={{
                    pixelOffset: new google.maps.Size(0, -26),
                  }}
                >
                  <div className="font-semibold text-slate-900 text-sm p-1">{name}</div>
                </InfoWindow>
              )}
            </>
          )}
        </GoogleMap>

        {!hasDirectCoords && geocode.status === "loading" ? (
          <div className="absolute inset-0 grid place-items-center bg-white/60 backdrop-blur-sm">
            <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
              Chargement de la carte…
            </div>
          </div>
        ) : null}

        {!hasDirectCoords && geocode.status === "error" ? (
          <div className="absolute bottom-3 start-3 rounded-lg border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 text-xs text-slate-700">
            Localisation approximative.
          </div>
        ) : null}
      </div>
    </div>
  );
}
