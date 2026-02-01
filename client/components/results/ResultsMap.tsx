import * as React from "react";
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from "@react-google-maps/api";
import { LocateFixed } from "lucide-react";

import { cn } from "@/lib/utils";
import { GOOGLE_MAPS_API_KEY, DEFAULT_MAP_CENTER, MARKER_COLOR } from "@/lib/googleMaps";

export type ResultsMapItem = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  promotionLabel?: string | null;
};

export interface ResultsMapProps {
  items: ResultsMapItem[];
  selectedId: string | null;
  highlightedId: string | null;
  userLocation: { lat: number; lng: number } | null;
  onRequestUserLocation: () => void;
  onSelect: (id: string) => void;
  onMarkerNavigateToCard: (id: string) => void;
  geoStatus?: "idle" | "requesting" | "available" | "denied";
}

function getDefaultCenter(): { lat: number; lng: number } {
  return DEFAULT_MAP_CENTER;
}

function hasFiniteLatLng(item: ResultsMapItem): boolean {
  return Number.isFinite(item.lat) && Number.isFinite(item.lng);
}

const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  styles: [
    {
      featureType: "poi",
      elementType: "labels",
      stylers: [{ visibility: "off" }],
    },
  ],
};

export function ResultsMap({
  items,
  selectedId,
  highlightedId,
  userLocation,
  onRequestUserLocation,
  onSelect,
  onMarkerNavigateToCard,
  geoStatus = "idle",
}: ResultsMapProps) {
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const [activeInfoWindow, setActiveInfoWindow] = React.useState<string | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  // Filter items with valid coordinates
  const mappableItems = React.useMemo(() => items.filter(hasFiniteLatLng), [items]);

  // Calculate center and zoom based on items
  const { center, zoom } = React.useMemo(() => {
    if (mappableItems.length === 0) {
      if (userLocation) {
        return { center: userLocation, zoom: 14 };
      }
      return { center: getDefaultCenter(), zoom: 12 };
    }

    if (mappableItems.length === 1) {
      return { center: { lat: mappableItems[0].lat, lng: mappableItems[0].lng }, zoom: 15 };
    }

    // Calculate bounds
    let minLat = mappableItems[0].lat;
    let maxLat = mappableItems[0].lat;
    let minLng = mappableItems[0].lng;
    let maxLng = mappableItems[0].lng;

    mappableItems.forEach((item) => {
      minLat = Math.min(minLat, item.lat);
      maxLat = Math.max(maxLat, item.lat);
      minLng = Math.min(minLng, item.lng);
      maxLng = Math.max(maxLng, item.lng);
    });

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    // Estimate zoom level based on span
    const latSpan = maxLat - minLat;
    const lngSpan = maxLng - minLng;
    const maxSpan = Math.max(latSpan, lngSpan);

    let estimatedZoom = 12;
    if (maxSpan < 0.01) estimatedZoom = 16;
    else if (maxSpan < 0.05) estimatedZoom = 14;
    else if (maxSpan < 0.1) estimatedZoom = 13;
    else if (maxSpan < 0.5) estimatedZoom = 11;
    else estimatedZoom = 10;

    return { center: { lat: centerLat, lng: centerLng }, zoom: estimatedZoom };
  }, [mappableItems, userLocation]);

  // Fly to selected item
  React.useEffect(() => {
    if (!mapRef.current || !selectedId) return;
    const item = mappableItems.find((i) => i.id === selectedId);
    if (!item) return;
    mapRef.current.panTo({ lat: item.lat, lng: item.lng });
    const currentZoom = mapRef.current.getZoom() ?? 12;
    if (currentZoom < 14) {
      mapRef.current.setZoom(14);
    }
  }, [mappableItems, selectedId]);

  const onMapLoad = React.useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const handleMarkerClick = (itemId: string) => {
    setActiveInfoWindow(itemId);
    onSelect(itemId);
    onMarkerNavigateToCard(itemId);
  };

  const centerOnUserLocation = () => {
    if (!userLocation) {
      onRequestUserLocation();
      return;
    }
    mapRef.current?.panTo(userLocation);
    mapRef.current?.setZoom(15);
  };

  if (loadError) {
    return (
      <div className="relative w-full h-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Erreur de chargement de la carte</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="relative w-full h-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Chargement de la carte...</div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={zoom}
        options={mapOptions}
        onLoad={onMapLoad}
      >
        {/* User location marker */}
        {userLocation && (
          <Marker
            position={userLocation}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: "#3b82f6",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 3,
            }}
            zIndex={1000}
          />
        )}

        {/* Establishment markers */}
        {mappableItems.map((item) => {
          const isSelected = item.id === selectedId;
          const isHighlighted = item.id === highlightedId;

          return (
            <React.Fragment key={item.id}>
              <Marker
                position={{ lat: item.lat, lng: item.lng }}
                onClick={() => handleMarkerClick(item.id)}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: isSelected ? 12 : isHighlighted ? 11 : 10,
                  fillColor: isSelected || isHighlighted ? MARKER_COLOR : "#ffffff",
                  fillOpacity: 1,
                  strokeColor: MARKER_COLOR,
                  strokeWeight: isSelected ? 3 : 2,
                }}
                zIndex={isSelected ? 999 : isHighlighted ? 998 : 1}
              />

              {activeInfoWindow === item.id && (
                <InfoWindow
                  position={{ lat: item.lat, lng: item.lng }}
                  onCloseClick={() => setActiveInfoWindow(null)}
                  options={{
                    pixelOffset: new google.maps.Size(0, -15),
                  }}
                >
                  <div className="min-w-[160px] p-1">
                    <div className="font-semibold text-slate-900 text-sm">{item.name}</div>
                    <div className="text-xs text-slate-600 flex items-center gap-2 mt-1">
                      {typeof item.rating === "number" && <span>⭐ {item.rating.toFixed(1)}</span>}
                      {item.promotionLabel ? (
                        <span className="px-2 py-0.5 rounded-full bg-primary text-white font-semibold text-[10px]">
                          {item.promotionLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </InfoWindow>
              )}
            </React.Fragment>
          );
        })}
      </GoogleMap>

      {/* Center on user location button */}
      <button
        type="button"
        onClick={centerOnUserLocation}
        disabled={geoStatus === "requesting"}
        className={cn(
          "absolute top-3 right-3 z-[500] h-10 w-10 rounded-lg border bg-white shadow-sm",
          "hover:bg-slate-50 active:bg-slate-100 grid place-items-center",
          "disabled:opacity-50 disabled:cursor-wait",
          geoStatus === "denied" ? "border-red-300" : "border-slate-200",
        )}
        aria-label={
          geoStatus === "requesting"
            ? "Localisation en cours..."
            : geoStatus === "denied"
              ? "Géolocalisation refusée - Cliquez pour réessayer"
              : userLocation
                ? "Centrer sur ma position"
                : "Activer la géolocalisation"
        }
        title={
          geoStatus === "denied"
            ? "La géolocalisation a été refusée. Vérifiez les permissions de votre navigateur."
            : undefined
        }
      >
        <LocateFixed
          className={cn(
            "h-5 w-5",
            geoStatus === "requesting" && "animate-pulse",
            geoStatus === "available" && userLocation ? "text-blue-600" :
            geoStatus === "denied" ? "text-red-500" : "text-slate-700"
          )}
        />
      </button>
    </div>
  );
}
