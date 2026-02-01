import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from "@react-google-maps/api";

import { useGeocodedQuery } from "@/hooks/useGeocodedQuery";
import { cn } from "@/lib/utils";
import { GOOGLE_MAPS_API_KEY, DEFAULT_MAP_CENTER, MARKER_COLOR, defaultMapOptions } from "@/lib/googleMaps";

type LatLng = { lat: number; lng: number };

const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

export function RestaurantMap({
  query,
  name,
  className,
  heightClassName = "h-96",
}: {
  query: string;
  name: string;
  className?: string;
  heightClassName?: string;
}) {
  const geocode = useGeocodedQuery(query);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [showInfoWindow, setShowInfoWindow] = useState(false);

  const coords = geocode.status === "success" ? geocode.coords : DEFAULT_MAP_CENTER;
  const showMarker = geocode.status === "success";

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Center map when coords change
  useEffect(() => {
    if (mapRef.current && geocode.status === "success") {
      mapRef.current.panTo(coords);
      const currentZoom = mapRef.current.getZoom() ?? 14;
      if (currentZoom < 14) {
        mapRef.current.setZoom(14);
      }
    }
  }, [coords, geocode.status]);

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
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 12,
                  fillColor: MARKER_COLOR,
                  fillOpacity: 1,
                  strokeColor: "#ffffff",
                  strokeWeight: 3,
                }}
              />

              {showInfoWindow && (
                <InfoWindow
                  position={coords}
                  onCloseClick={() => setShowInfoWindow(false)}
                  options={{
                    pixelOffset: new google.maps.Size(0, -15),
                  }}
                >
                  <div className="font-semibold text-slate-900 text-sm p-1">{name}</div>
                </InfoWindow>
              )}
            </>
          )}
        </GoogleMap>

        {geocode.status === "loading" ? (
          <div className="absolute inset-0 grid place-items-center bg-white/60 backdrop-blur-sm">
            <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
              Chargement de la carte…
            </div>
          </div>
        ) : null}

        {geocode.status === "error" ? (
          <div className="absolute bottom-3 left-3 rounded-lg border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 text-xs text-slate-700">
            Localisation approximative.
          </div>
        ) : null}
      </div>
    </div>
  );
}
