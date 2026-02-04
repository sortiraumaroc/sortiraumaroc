import { useState, useEffect, useCallback } from "react";
import {
  getPublicHomeCities,
  getPublicCountries,
  detectUserCountry,
  type PublicHomeCity,
  type PublicCountry,
} from "@/lib/publicApi";

const COUNTRY_STORAGE_KEY = "sam_selected_country";
const DETECTED_COUNTRY_KEY = "sam_detected_country";

export type CityItem = {
  id: string;
  name: string;
  slug: string;
};

export function useCountryDetection() {
  const [countries, setCountries] = useState<PublicCountry[]>([]);
  const [cities, setCities] = useState<CityItem[]>([]);
  const [selectedCountry, setSelectedCountryState] = useState<string | null>(null);
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load saved country preference
  useEffect(() => {
    const saved = localStorage.getItem(COUNTRY_STORAGE_KEY);
    const detected = localStorage.getItem(DETECTED_COUNTRY_KEY);
    if (saved) setSelectedCountryState(saved);
    if (detected) setDetectedCountry(detected);
  }, []);

  // Detect user's country on first load
  useEffect(() => {
    const detect = async () => {
      // Don't detect if already detected or selected
      const saved = localStorage.getItem(COUNTRY_STORAGE_KEY);
      const detected = localStorage.getItem(DETECTED_COUNTRY_KEY);
      if (saved || detected) return;

      try {
        const res = await detectUserCountry();
        if (res.ok && res.country_code) {
          setDetectedCountry(res.country_code);
          localStorage.setItem(DETECTED_COUNTRY_KEY, res.country_code);
          // Auto-select detected country if no preference saved
          if (!saved) {
            setSelectedCountryState(res.country_code);
          }
        }
      } catch {
        // Silently fail, will use default country
      }
    };

    void detect();
  }, []);

  // Load countries
  useEffect(() => {
    const loadCountries = async () => {
      try {
        const res = await getPublicCountries();
        if (res.ok) {
          setCountries(res.countries);

          // If no country selected yet, use default
          if (!selectedCountry) {
            const defaultCountry = res.countries.find(c => c.is_default);
            if (defaultCountry) {
              setSelectedCountryState(defaultCountry.code);
            }
          }
        }
      } catch (e) {
        setError("Erreur de chargement des pays");
      }
    };

    void loadCountries();
  }, [selectedCountry]);

  // Load cities for selected country
  useEffect(() => {
    const loadCities = async () => {
      if (!selectedCountry) return;

      setIsLoading(true);
      try {
        const res = await getPublicHomeCities({ country: selectedCountry });
        if (res.ok) {
          setCities(res.cities.map(c => ({
            id: c.slug || c.id,
            name: c.name,
            slug: c.slug,
          })));
        }
      } catch {
        setError("Erreur de chargement des villes");
      } finally {
        setIsLoading(false);
      }
    };

    void loadCities();
  }, [selectedCountry]);

  // Set selected country
  const setSelectedCountry = useCallback((countryCode: string) => {
    setSelectedCountryState(countryCode);
    localStorage.setItem(COUNTRY_STORAGE_KEY, countryCode);
  }, []);

  // Get current country info
  const currentCountry = countries.find(c => c.code === selectedCountry) ?? null;

  return {
    countries,
    cities,
    selectedCountry,
    setSelectedCountry,
    detectedCountry,
    currentCountry,
    isLoading,
    error,
  };
}

// Simpler hook that just returns cities for the current/detected country
export function useDynamicCities() {
  const [cities, setCities] = useState<CityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        // Get detected or saved country
        let countryCode = localStorage.getItem(COUNTRY_STORAGE_KEY);
        if (!countryCode) {
          countryCode = localStorage.getItem(DETECTED_COUNTRY_KEY);
        }
        if (!countryCode) {
          // Try to detect
          try {
            const detected = await detectUserCountry();
            if (detected.ok) {
              countryCode = detected.country_code;
              localStorage.setItem(DETECTED_COUNTRY_KEY, countryCode);
            }
          } catch {
            countryCode = "MA"; // Default to Morocco
          }
        }

        // Load cities for this country
        const res = await getPublicHomeCities({ country: countryCode || undefined });
        if (res.ok && res.cities.length > 0) {
          setCities(res.cities.map(c => ({
            id: c.slug || c.id,
            name: c.name,
            slug: c.slug,
          })));
        } else {
          // Fallback to all cities if no cities for specific country
          const allCities = await getPublicHomeCities();
          if (allCities.ok) {
            setCities(allCities.cities.map(c => ({
              id: c.slug || c.id,
              name: c.name,
              slug: c.slug,
            })));
          }
        }
      } catch {
        // Fallback to empty - UI should handle gracefully
        setCities([]);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  return { cities, isLoading };
}
