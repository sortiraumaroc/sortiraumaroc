/**
 * Hook pour détecter automatiquement la ville de l'utilisateur
 * basée sur sa géolocalisation.
 */

import { useState, useEffect, useCallback } from "react";

// Coordonnées des principales villes marocaines
export const CITY_COORDINATES: Array<{
  name: string;
  lat: number;
  lng: number;
  radius: number; // Rayon en km pour matcher la ville
}> = [
  { name: "Casablanca", lat: 33.5731, lng: -7.5898, radius: 25 },
  { name: "Marrakech", lat: 31.6295, lng: -7.9811, radius: 20 },
  { name: "Rabat", lat: 34.0209, lng: -6.8416, radius: 15 },
  { name: "Fès", lat: 34.0331, lng: -5.0003, radius: 15 },
  { name: "Tanger", lat: 35.7673, lng: -5.7998, radius: 15 },
  { name: "Agadir", lat: 30.4278, lng: -9.5981, radius: 20 },
  { name: "Meknès", lat: 33.8935, lng: -5.5547, radius: 12 },
  { name: "Oujda", lat: 34.6814, lng: -1.9086, radius: 15 },
  { name: "Kénitra", lat: 34.261, lng: -6.5802, radius: 12 },
  { name: "Tétouan", lat: 35.5889, lng: -5.3626, radius: 10 },
  { name: "Essaouira", lat: 31.5085, lng: -9.7595, radius: 10 },
  { name: "Mohammédia", lat: 33.6861, lng: -7.3828, radius: 10 },
  { name: "El Jadida", lat: 33.2316, lng: -8.5007, radius: 12 },
  { name: "Salé", lat: 34.0531, lng: -6.7985, radius: 10 },
  { name: "Nador", lat: 35.1681, lng: -2.9287, radius: 12 },
  { name: "Beni Mellal", lat: 32.3373, lng: -6.3498, radius: 12 },
  { name: "Taza", lat: 34.2133, lng: -4.0103, radius: 10 },
  { name: "Settat", lat: 33.0017, lng: -7.6164, radius: 10 },
  { name: "Safi", lat: 32.2994, lng: -9.2372, radius: 12 },
  { name: "Khouribga", lat: 32.8811, lng: -6.9063, radius: 10 },
  { name: "Dakhla", lat: 23.7147, lng: -15.9328, radius: 15 },
  { name: "Laâyoune", lat: 27.1253, lng: -13.1625, radius: 15 },
  { name: "Bouskoura", lat: 33.4489, lng: -7.6486, radius: 10 },
];

/**
 * Retourne les coordonnées d'une ville par son nom (case-insensitive)
 */
export function getCityCoordinates(cityName: string): { lat: number; lng: number } | null {
  const lower = cityName.toLowerCase();
  const match = CITY_COORDINATES.find((c) => c.name.toLowerCase() === lower);
  return match ? { lat: match.lat, lng: match.lng } : null;
}

/**
 * Calcule la distance entre deux points GPS (formule de Haversine)
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Rayon de la Terre en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Trouve la ville la plus proche des coordonnées données
 */
function findNearestCity(lat: number, lng: number): string | null {
  let nearestCity: string | null = null;
  let minDistance = Infinity;

  for (const city of CITY_COORDINATES) {
    const distance = calculateDistance(lat, lng, city.lat, city.lng);

    // Vérifier si on est dans le rayon de la ville
    if (distance <= city.radius && distance < minDistance) {
      minDistance = distance;
      nearestCity = city.name;
    }
  }

  // Si on n'est dans aucun rayon, prendre la ville la plus proche quand même
  // mais seulement si elle est à moins de 50km
  if (!nearestCity) {
    for (const city of CITY_COORDINATES) {
      const distance = calculateDistance(lat, lng, city.lat, city.lng);
      if (distance < minDistance) {
        minDistance = distance;
        nearestCity = city.name;
      }
    }

    // Si la ville la plus proche est à plus de 50km, ne pas la retourner
    if (minDistance > 50) {
      return null;
    }
  }

  return nearestCity;
}

export type DetectedCityStatus = "idle" | "detecting" | "detected" | "denied" | "unavailable";

export interface UseDetectedCityResult {
  status: DetectedCityStatus;
  city: string | null;
  coordinates: { lat: number; lng: number } | null;
  source: "gps" | "ip" | null;
  detect: () => void;
}

/**
 * Fallback : détection de la ville via l'adresse IP (côté serveur)
 * Appelé uniquement quand le GPS est refusé/indisponible.
 */
async function fetchCityFromIP(): Promise<{
  city: string | null;
  coordinates: { lat: number; lng: number } | null;
}> {
  try {
    const resp = await fetch("/api/public/detect-city");
    if (!resp.ok) return { city: null, coordinates: null };
    const data = await resp.json();
    if (data.ok && data.city) {
      return {
        city: data.city,
        coordinates: data.coordinates ?? null,
      };
    }
  } catch {
    // Silently fail — IP detection is best-effort
  }
  return { city: null, coordinates: null };
}

/**
 * Hook pour détecter automatiquement la ville de l'utilisateur
 *
 * @param autoDetect - Si true, détecte automatiquement au chargement (si permission déjà accordée)
 * @returns { status, city, coordinates, detect }
 */
export function useDetectedCity(autoDetect: boolean = true): UseDetectedCityResult {
  const [status, setStatus] = useState<DetectedCityStatus>("idle");
  const [city, setCity] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [source, setSource] = useState<"gps" | "ip" | null>(null);

  // Fallback IP : appelé quand le GPS échoue
  const fallbackToIP = useCallback(async () => {
    const result = await fetchCityFromIP();
    if (result.city) {
      setCity(result.city);
      setCoordinates(result.coordinates);
      setSource("ip");
      setStatus("detected");
    }
    // Si IP ne donne rien non plus, on laisse le status tel quel (denied/unavailable)
  }, []);

  const detect = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus("unavailable");
      fallbackToIP();
      return;
    }

    setStatus("detecting");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCoordinates({ lat: latitude, lng: longitude });

        const detectedCity = findNearestCity(latitude, longitude);
        setCity(detectedCity);
        setSource("gps");
        setStatus("detected");
      },
      (error) => {
        // Only warn once to avoid console spam on re-renders
        if (!(window as any).__geoWarnLogged) {
          // Geolocation error (logged once)
          (window as any).__geoWarnLogged = true;
        }
        const geoStatus = error.code === 1 ? "denied" : "unavailable";
        setStatus(geoStatus);
        // GPS a échoué → tenter le fallback IP
        fallbackToIP();
      },
      {
        enableHighAccuracy: false, // Pas besoin de haute précision pour détecter une ville
        timeout: 10000,
        maximumAge: 5 * 60 * 1000, // Accepter une position mise en cache jusqu'à 5 minutes
      }
    );
  }, [fallbackToIP]);

  // Auto-détection au chargement si autoDetect est true
  useEffect(() => {
    if (!autoDetect) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      fallbackToIP();
      return;
    }

    // Vérifier si la permission est déjà accordée ou demandable
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((result) => {
          if (result.state === "granted" || result.state === "prompt") {
            // Permission accordée ou demandable → détecter automatiquement
            detect();
          } else if (result.state === "denied") {
            setStatus("denied");
            // GPS refusé → tenter le fallback IP
            fallbackToIP();
          }
        })
        .catch(() => {
          // API permissions non supportée, tenter quand même la détection
          detect();
        });
    } else {
      // Pas d'API permissions → tenter directement
      detect();
    }
  }, [autoDetect, detect, fallbackToIP]);

  return { status, city, coordinates, source, detect };
}

/**
 * Fonction utilitaire pour détecter la ville une seule fois (sans hook)
 */
export function detectCityOnce(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const detectedCity = findNearestCity(
          position.coords.latitude,
          position.coords.longitude
        );
        resolve(detectedCity);
      },
      () => {
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 5 * 60 * 1000,
      }
    );
  });
}
