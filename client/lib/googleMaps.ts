// Google Maps configuration
export const GOOGLE_MAPS_API_KEY = "AIzaSyA3pLo5Uu8jYZCHJz3s2VqwyzFZtLd9QE0";

// Default map options for consistent styling across the app
export const defaultMapOptions: google.maps.MapOptions = {
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

// Default center (Marrakech)
export const DEFAULT_MAP_CENTER = { lat: 31.6295, lng: -8.0089 };

// SAM brand color for markers
export const MARKER_COLOR = "#a3001d";
