import * as React from "react";
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from "@react-google-maps/api";
import { LocateFixed, RotateCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { GOOGLE_MAPS_API_KEY, DEFAULT_MAP_CENTER, MARKER_COLOR } from "@/lib/googleMaps";
import { getCityCoordinates } from "@/hooks/useDetectedCity";

// ── Round SAM logo marker (same as RestaurantMap) ──
const SAM_LOGO_SRC = "/Logo_SAM_Megaphone_Blanc.png";
const MARKER_SIZE = 56;
const HIGHLIGHTED_MARKER_SIZE = 80; // Larger canvas for glow ring

function createRoundMarkerIcon(highlighted = false): Promise<string> {
  const size = highlighted ? HIGHLIGHTED_MARKER_SIZE : MARKER_SIZE;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(""); return; }

      const cx = size / 2;
      const cy = size / 2;

      if (highlighted) {
        // Outer glow ring for highlighted state
        const outerR = size / 2 - 2;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(163, 0, 29, 0.18)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
        ctx.strokeStyle = "#a3001d";
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      const logoR = highlighted ? 24 : MARKER_SIZE / 2 - 2;

      // Red circle background
      ctx.beginPath();
      ctx.arc(cx, cy, logoR, 0, Math.PI * 2);
      ctx.fillStyle = "#a3001d"; // SAM primary
      ctx.fill();

      // Clip to circle for logo
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, logoR - 2, 0, Math.PI * 2);
      ctx.clip();
      const logoSize = (logoR - 2) * 2;
      ctx.drawImage(img, cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize);
      ctx.restore();

      // White border
      ctx.beginPath();
      ctx.arc(cx, cy, logoR, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = highlighted ? 4 : 3;
      ctx.stroke();

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = SAM_LOGO_SRC;
  });
}

/** Creates a normal marker with a small green promo badge in the top-right corner. */
function createPromoMarkerIcon(): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const size = MARKER_SIZE;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(""); return; }

      const cx = size / 2;
      const cy = size / 2;
      const logoR = size / 2 - 2;

      // Red circle background
      ctx.beginPath();
      ctx.arc(cx, cy, logoR, 0, Math.PI * 2);
      ctx.fillStyle = "#a3001d";
      ctx.fill();

      // Clip to circle for logo
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, logoR - 2, 0, Math.PI * 2);
      ctx.clip();
      const logoSize = (logoR - 2) * 2;
      ctx.drawImage(img, cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize);
      ctx.restore();

      // White border
      ctx.beginPath();
      ctx.arc(cx, cy, logoR, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Promo badge — small green circle with "%" at top-right
      const badgeR = 9;
      const bx = size - badgeR - 1;
      const by = badgeR + 1;
      ctx.beginPath();
      ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = "#16a34a";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("%", bx, by + 0.5);

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = SAM_LOGO_SRC;
  });
}

let _cachedMarkerUrl: string | null = null;
let _cachedHighlightedUrl: string | null = null;
let _cachedPromoUrl: string | null = null;
let _markerPromise: Promise<string> | null = null;
let _highlightedPromise: Promise<string> | null = null;
let _promoPromise: Promise<string> | null = null;

function useRoundMarkerIcons(): { normal: string | null; highlighted: string | null; promo: string | null } {
  const [normalUrl, setNormalUrl] = React.useState<string | null>(_cachedMarkerUrl);
  const [highlightedUrl, setHighlightedUrl] = React.useState<string | null>(_cachedHighlightedUrl);
  const [promoUrl, setPromoUrl] = React.useState<string | null>(_cachedPromoUrl);
  React.useEffect(() => {
    // Normal marker
    if (_cachedMarkerUrl) { setNormalUrl(_cachedMarkerUrl); }
    else {
      if (!_markerPromise) _markerPromise = createRoundMarkerIcon(false);
      _markerPromise.then((dataUrl) => {
        _cachedMarkerUrl = dataUrl || null;
        setNormalUrl(_cachedMarkerUrl);
      });
    }
    // Highlighted marker
    if (_cachedHighlightedUrl) { setHighlightedUrl(_cachedHighlightedUrl); }
    else {
      if (!_highlightedPromise) _highlightedPromise = createRoundMarkerIcon(true);
      _highlightedPromise.then((dataUrl) => {
        _cachedHighlightedUrl = dataUrl || null;
        setHighlightedUrl(_cachedHighlightedUrl);
      });
    }
    // Promo marker
    if (_cachedPromoUrl) { setPromoUrl(_cachedPromoUrl); }
    else {
      if (!_promoPromise) _promoPromise = createPromoMarkerIcon();
      _promoPromise.then((dataUrl) => {
        _cachedPromoUrl = dataUrl || null;
        setPromoUrl(_cachedPromoUrl);
      });
    }
  }, []);
  return { normal: normalUrl, highlighted: highlightedUrl, promo: promoUrl };
}

export type ResultsMapItem = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  promotionLabel?: string | null;
  /** Path to the detail page (e.g. /restaurant/abc123) */
  detailPath?: string;
  /** Cover image URL */
  image?: string;
  /** Phone number */
  phone?: string;
  reviews?: number;
  nextSlot?: string | null;
  bookingEnabled?: boolean;
  category?: string;
};

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
  center: { lat: number; lng: number };
}

export interface ResultsMapProps {
  items: ResultsMapItem[];
  selectedId: string | null;
  highlightedId: string | null;
  userLocation: { lat: number; lng: number } | null;
  onRequestUserLocation: () => void;
  onSelect: (id: string) => void;
  onMarkerNavigateToCard: (id: string) => void;
  onMarkerHover?: (id: string | null) => void;
  onSearchArea?: (bounds: MapBounds) => void;
  geoStatus?: "idle" | "requesting" | "available" | "denied";
  cityName?: string | null;
  isMobile?: boolean;
  onMobileMarkerTap?: (item: ResultsMapItem) => void;
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
  onMarkerHover,
  onSearchArea,
  geoStatus = "idle",
  cityName,
  isMobile = false,
  onMobileMarkerTap,
}: ResultsMapProps) {
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const [activeInfoWindow, setActiveInfoWindow] = React.useState<string | null>(null);
  const [hoveredTooltipId, setHoveredTooltipId] = React.useState<string | null>(null);
  const { normal: roundMarkerUrl, highlighted: highlightedMarkerUrl, promo: promoMarkerUrl } = useRoundMarkerIcons();

  // Store refs to native google.maps.Marker instances
  const markerRefs = React.useRef<Map<string, google.maps.Marker>>(new Map());
  // Stable ref for onMarkerHover callback (avoids stale closures in native listeners)
  const onMarkerHoverRef = React.useRef(onMarkerHover);
  React.useEffect(() => { onMarkerHoverRef.current = onMarkerHover; }, [onMarkerHover]);
  // Debounced mouseout — avoids flickering when moving between adjacent markers
  const mouseOutTimerRef = React.useRef<ReturnType<typeof setTimeout>>();
  React.useEffect(() => () => { if (mouseOutTimerRef.current) clearTimeout(mouseOutTimerRef.current); }, []);

  // "Search this area" button state
  const [showSearchHere, setShowSearchHere] = React.useState(false);
  const [isSearching, setIsSearching] = React.useState(false);
  const hasUserInteracted = React.useRef(false);
  const initialLoadDone = React.useRef(false);
  const [mapReady, setMapReady] = React.useState(false);

  // When true, the map should NOT recenter when items change
  // (e.g. after "Rechercher ici" — user wants to stay in the same view)
  const lockViewRef = React.useRef(false);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  // Filter items with valid coordinates
  const mappableItems = React.useMemo(() => items.filter(hasFiniteLatLng), [items]);

  // Resolve city coordinates once
  const cityCenter = React.useMemo(
    () => (cityName ? getCityCoordinates(cityName) : null),
    [cityName],
  );

  // Calculate center and zoom based on items — used only for INITIAL positioning
  const initialCenter = React.useMemo(() => {
    if (mappableItems.length === 0) {
      if (cityCenter) return cityCenter;
      if (userLocation) return userLocation;
      return getDefaultCenter();
    }
    if (mappableItems.length === 1) {
      return { lat: mappableItems[0].lat, lng: mappableItems[0].lng };
    }
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
    return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only compute ONCE on mount

  const initialZoom = React.useMemo(() => {
    if (mappableItems.length === 0) return userLocation ? 14 : 12;
    if (mappableItems.length === 1) return 15;
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
    const maxSpan = Math.max(maxLat - minLat, maxLng - minLng);
    if (maxSpan < 0.01) return 16;
    if (maxSpan < 0.05) return 14;
    if (maxSpan < 0.1) return 13;
    if (maxSpan < 0.5) return 11;
    return 10;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only compute ONCE on mount

  // Show mini tooltip when an item is highlighted from the list (not when InfoWindow is open)
  React.useEffect(() => {
    if (highlightedId && activeInfoWindow !== highlightedId) {
      setHoveredTooltipId(highlightedId);
    } else {
      setHoveredTooltipId(null);
    }
  }, [highlightedId, activeInfoWindow]);

  // Immediately update native marker icon/zIndex when highlightedId changes (bypasses React re-render delay)
  const prevHighlightedRef = React.useRef<string | null>(null);
  const mappableItemsRef = React.useRef(mappableItems);
  mappableItemsRef.current = mappableItems; // always fresh, no dependency needed

  React.useEffect(() => {
    const prev = prevHighlightedRef.current;
    prevHighlightedRef.current = highlightedId;

    // Restore previous marker to normal
    if (prev && prev !== highlightedId) {
      const prevMarker = markerRefs.current.get(prev);
      if (prevMarker && roundMarkerUrl) {
        const prevItem = mappableItemsRef.current.find((i) => i.id === prev);
        const hasPromo = !!prevItem?.promotionLabel;
        prevMarker.setIcon({
          url: hasPromo && promoMarkerUrl ? promoMarkerUrl : roundMarkerUrl,
          scaledSize: new google.maps.Size(42, 42),
          anchor: new google.maps.Point(21, 21),
        });
        prevMarker.setZIndex(1);
      }
    }

    // Highlight new marker
    if (highlightedId) {
      const marker = markerRefs.current.get(highlightedId);
      if (marker && highlightedMarkerUrl) {
        marker.setIcon({
          url: highlightedMarkerUrl,
          scaledSize: new google.maps.Size(62, 62),
          anchor: new google.maps.Point(31, 31),
        });
        marker.setZIndex(9998);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedId, roundMarkerUrl, highlightedMarkerUrl, promoMarkerUrl]);

  // Force-clean Google Maps InfoWindow padding when it opens (fallback for CSS :has())
  // Triggers on both activeInfoWindow (click) and hoveredTooltipId (hover)
  React.useEffect(() => {
    if (!activeInfoWindow && !hoveredTooltipId) return;
    const raf = requestAnimationFrame(() => {
      // Wait a tick for the InfoWindow DOM to render
      setTimeout(() => {
        const iwContainers = document.querySelectorAll<HTMLElement>(".gm-style-iw-c");
        iwContainers.forEach((c) => {
          if (c.querySelector(".sam-map-infowindow")) {
            c.style.padding = "0";
            c.style.borderRadius = "12px";
            c.style.overflow = "hidden";
            const d = c.querySelector<HTMLElement>(".gm-style-iw-d");
            if (d) {
              d.style.overflow = "hidden";
              d.style.padding = "0";
              d.style.maxHeight = "none";
              d.style.maxWidth = "none";
            }
          }
        });
      }, 50);
    });
    return () => cancelAnimationFrame(raf);
  }, [activeInfoWindow, hoveredTooltipId]);

  // Helper to recenter map based on current items / city
  const recenterMap = React.useCallback(() => {
    if (!mapRef.current) return;
    if (mappableItems.length === 0) {
      if (cityCenter) {
        mapRef.current.panTo(cityCenter);
        mapRef.current.setZoom(12);
      }
      return;
    }
    if (mappableItems.length === 1) {
      mapRef.current.panTo({ lat: mappableItems[0].lat, lng: mappableItems[0].lng });
      mapRef.current.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    mappableItems.forEach((item) => {
      bounds.extend({ lat: item.lat, lng: item.lng });
    });
    mapRef.current.fitBounds(bounds, 50);
  }, [mappableItems, cityCenter]);

  // When items change from a NON-search-area action (e.g. city change, filter),
  // recenter the map to fit the new results. Skip if lockViewRef is set.
  // Also fires once mapReady flips to true (after initial 1s delay).
  React.useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    // If view is locked (after "Rechercher ici"), DON'T recenter
    if (lockViewRef.current) {
      lockViewRef.current = false; // reset for next time
      return;
    }
    recenterMap();
  }, [mappableItems, cityCenter, recenterMap, mapReady]);

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

    // Fit bounds to initial items if available
    if (mappableItems.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      mappableItems.forEach((item) => {
        bounds.extend({ lat: item.lat, lng: item.lng });
      });
      map.fitBounds(bounds, 50);
    } else if (cityCenter) {
      // If few/no items but we know the city, center on it
      map.panTo(cityCenter);
      map.setZoom(mappableItems.length === 1 ? 15 : 12);
    }

    // Mark initial load as done after a short delay, then trigger recenter
    // (items may have arrived from API during this window)
    setTimeout(() => {
      initialLoadDone.current = true;
      setMapReady(true); // triggers recenter effect
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show "Search here" button when user pans or zooms the map
  const handleMapDragEnd = React.useCallback(() => {
    if (!initialLoadDone.current) return;
    hasUserInteracted.current = true;
    setShowSearchHere(true);
  }, []);

  const handleMapZoomChanged = React.useCallback(() => {
    if (!initialLoadDone.current || !hasUserInteracted.current) return;
    setShowSearchHere(true);
  }, []);

  const handleSearchHere = React.useCallback(() => {
    if (!mapRef.current || !onSearchArea) return;
    const bounds = mapRef.current.getBounds();
    const centerPt = mapRef.current.getCenter();
    if (!bounds || !centerPt) return;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    // Lock the view so the map does NOT recenter when new items arrive
    lockViewRef.current = true;

    setIsSearching(true);
    setShowSearchHere(false);

    onSearchArea({
      north: ne.lat(),
      south: sw.lat(),
      east: ne.lng(),
      west: sw.lng(),
      center: { lat: centerPt.lat(), lng: centerPt.lng() },
    });

    // Reset searching state after a short delay
    setTimeout(() => setIsSearching(false), 1500);
  }, [onSearchArea]);

  const handleMarkerClick = (itemId: string) => {
    if (isMobile && onMobileMarkerTap) {
      const item = mappableItems.find((i) => i.id === itemId);
      if (item) {
        setActiveInfoWindow(null);
        onMobileMarkerTap(item);
      }
    } else {
      setActiveInfoWindow(itemId);
    }
    // onMarkerNavigateToCard already calls setSelectedRestaurant + setHighlightedRestaurant + scrollToCard
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
        center={initialCenter}
        zoom={initialZoom}
        options={mapOptions}
        onLoad={onMapLoad}
        onDragEnd={handleMapDragEnd}
        onZoomChanged={handleMapZoomChanged}
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

        {/* Establishment markers - round SAM logos */}
        {mappableItems.map((item) => {
          const isSelected = item.id === selectedId;
          const isHighlighted = item.id === highlightedId;
          const useHighlightedIcon = (isHighlighted || isSelected) && highlightedMarkerUrl;
          const hasPromo = !!item.promotionLabel;
          const markerSize = isSelected ? 64 : isHighlighted ? 62 : 42;

          return (
            <React.Fragment key={item.id}>
              <Marker
                position={{ lat: item.lat, lng: item.lng }}
                onClick={() => handleMarkerClick(item.id)}
                onLoad={(marker) => {
                  markerRefs.current.set(item.id, marker);
                  // Attach native Google Maps listeners for reliable hover detection
                  const itemId = item.id;
                  google.maps.event.addListener(marker, "mouseover", () => {
                    // Cancel pending mouseout — prevents flicker when moving between adjacent markers
                    if (mouseOutTimerRef.current) { clearTimeout(mouseOutTimerRef.current); mouseOutTimerRef.current = undefined; }
                    onMarkerHoverRef.current?.(itemId);
                  });
                  google.maps.event.addListener(marker, "mouseout", () => {
                    // Delay mouseout to avoid flicker
                    mouseOutTimerRef.current = setTimeout(() => {
                      onMarkerHoverRef.current?.(null);
                    }, 80);
                  });
                }}
                onUnmount={() => {
                  const m = markerRefs.current.get(item.id);
                  if (m) google.maps.event.clearInstanceListeners(m);
                  markerRefs.current.delete(item.id);
                }}
                {...(roundMarkerUrl ? {
                  icon: {
                    url: useHighlightedIcon
                      ? highlightedMarkerUrl!
                      : hasPromo && promoMarkerUrl
                        ? promoMarkerUrl
                        : roundMarkerUrl,
                    scaledSize: new google.maps.Size(markerSize, markerSize),
                    anchor: new google.maps.Point(markerSize / 2, markerSize / 2),
                  },
                } : {
                  icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: isSelected ? 12 : isHighlighted ? 11 : 10,
                    fillColor: isSelected || isHighlighted ? MARKER_COLOR : "#ffffff",
                    fillOpacity: 1,
                    strokeColor: MARKER_COLOR,
                    strokeWeight: isSelected ? 3 : 2,
                  },
                })}
                zIndex={isSelected ? 9999 : isHighlighted ? 9998 : 1}
              />

              {/* Hover tooltip — photo + name + "En savoir +" (desktop) */}
              {hoveredTooltipId === item.id && activeInfoWindow !== item.id && !isMobile && (
                <InfoWindow
                  position={{ lat: item.lat, lng: item.lng }}
                  options={{
                    pixelOffset: new google.maps.Size(0, -30),
                    disableAutoPan: true,
                    maxWidth: 190,
                  }}
                >
                  <div className="sam-map-infowindow" style={{ width: 170, fontFamily: "Inter, Poppins, sans-serif", margin: 0, padding: 0 }}>
                    {/* Cover image */}
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        style={{
                          width: "100%",
                          height: 75,
                          objectFit: "cover",
                          display: "block",
                          margin: 0,
                          padding: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: 45,
                          background: "linear-gradient(135deg, #a3001d 0%, #c9002e 100%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          margin: 0,
                          padding: 0,
                        }}
                      >
                        <img src="/Logo_SAM_Megaphone_Blanc.png" alt="SAM" style={{ height: 22, opacity: 0.9 }} />
                      </div>
                    )}

                    {/* Name + button */}
                    <div style={{ padding: "6px 8px 8px" }}>
                      <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.3, color: "#1a1a2e", marginBottom: 5 }}>
                        {item.name}
                      </div>

                      {item.detailPath && (
                        <a
                          href={item.detailPath}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "100%",
                            padding: "4px 8px",
                            borderRadius: 9999,
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#fff",
                            backgroundColor: "#a3001d",
                            textDecoration: "none",
                          }}
                        >
                          En savoir +
                        </a>
                      )}
                    </div>
                  </div>
                </InfoWindow>
              )}

              {/* Full InfoWindow — click on marker (desktop only) */}
              {!isMobile && activeInfoWindow === item.id && (
                <InfoWindow
                  position={{ lat: item.lat, lng: item.lng }}
                  onCloseClick={() => setActiveInfoWindow(null)}
                  options={{
                    pixelOffset: new google.maps.Size(0, -26),
                    maxWidth: 210,
                  }}
                >
                  <div className="sam-map-infowindow" style={{ width: 180, fontFamily: "Inter, Poppins, sans-serif", position: "relative", margin: 0, padding: 0 }}>
                    {/* Cover image */}
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        style={{
                          width: "100%",
                          height: 85,
                          objectFit: "cover",
                          display: "block",
                          margin: 0,
                          padding: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: 45,
                          background: "linear-gradient(135deg, #a3001d 0%, #c9002e 100%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          margin: 0,
                          padding: 0,
                        }}
                      >
                        <img src="/Logo_SAM_Megaphone_Blanc.png" alt="SAM" style={{ height: 24, opacity: 0.9 }} />
                      </div>
                    )}

                    {/* Content */}
                    <div style={{ padding: "6px 8px 8px" }}>
                      <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.3, color: "#1a1a2e" }}>
                        {item.name}
                      </div>

                      {/* Category */}
                      {item.category && (
                        <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>{item.category}</div>
                      )}

                      {/* Rating + Reviews */}
                      {item.rating != null && item.rating > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}>
                          <span style={{ fontSize: 10, color: "#f59e0b" }}>&#9733;</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1a2e" }}>{item.rating.toFixed(1)}</span>
                          {item.reviews != null && item.reviews > 0 && (
                            <span style={{ fontSize: 9, color: "#94a3b8" }}>({item.reviews} avis)</span>
                          )}
                        </div>
                      )}

                      {/* Promo badge */}
                      {item.promotionLabel && (
                        <div style={{
                          display: "inline-block",
                          marginTop: 3,
                          padding: "1px 5px",
                          borderRadius: 4,
                          fontSize: 9,
                          fontWeight: 700,
                          color: "#fff",
                          backgroundColor: "#dc2626",
                        }}>
                          {item.promotionLabel}
                        </div>
                      )}

                      {/* Next slot */}
                      {item.nextSlot && (
                        <div style={{ fontSize: 9, color: "#059669", fontWeight: 600, marginTop: 3 }}>
                          Prochaine dispo : {item.nextSlot}
                        </div>
                      )}

                      {/* Action buttons */}
                      {item.detailPath && (
                        <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
                          <a
                            href={item.detailPath}
                            style={{
                              flex: 1,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "4px 6px",
                              borderRadius: 9999,
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#a3001d",
                              border: "1px solid #a3001d",
                              backgroundColor: "transparent",
                              textDecoration: "none",
                            }}
                          >
                            Voir
                          </a>
                          {item.bookingEnabled && (
                            <a
                              href={`${item.detailPath}#booking`}
                              style={{
                                flex: 1,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "4px 6px",
                                borderRadius: 9999,
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#fff",
                                backgroundColor: "#a3001d",
                                textDecoration: "none",
                              }}
                            >
                              Réserver
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </InfoWindow>
              )}
            </React.Fragment>
          );
        })}
      </GoogleMap>

      {/* "Search this area" button */}
      {onSearchArea && (showSearchHere || isSearching) && (
        <button
          type="button"
          onClick={handleSearchHere}
          disabled={isSearching}
          className={cn(
            "absolute top-3 left-1/2 -translate-x-1/2 z-[500]",
            "flex items-center gap-2 px-4 py-2.5 rounded-full",
            "bg-slate-900 text-white text-sm font-semibold",
            "shadow-lg hover:bg-slate-800 active:bg-slate-700",
            "transition-all duration-200",
            "disabled:opacity-70 disabled:cursor-wait",
          )}
        >
          <RotateCw className={cn("w-4 h-4", isSearching && "animate-spin")} />
          {isSearching ? "Recherche…" : "Rechercher ici"}
        </button>
      )}

      {/* Center on user location button */}
      <button
        type="button"
        onClick={centerOnUserLocation}
        disabled={geoStatus === "requesting"}
        className={cn(
          "absolute top-3 end-3 z-[500] h-10 w-10 rounded-lg border bg-white shadow-sm",
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
