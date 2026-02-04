import { useEffect, useState } from "react";

export interface PlaceContact {
  place_contact_id: number;
  key: "mobile" | "whatsapp" | "fixe" | "email" | "site" | "facebook" | "instagram" | "twitter" | "waze" | "tiktok" | "snapchat";
  value: string;
}

export interface EstablishmentData {
  placeId: number;
  name: string;
  slug: string;
  logo?: string;
  img?: string;
  banniereImg?: string;
  description?: string;
  address?: string;
  tagline?: string;
  nomReseauWifi?: string;
  codeWifi?: string;
  place_contacts?: PlaceContact[];
  client?: {
    clientId: number;
    name: string;
    email: string;
  };
  geoFenceEnabled?: boolean;
  geoFenceRadiusMeters?: number;
  latitude?: number;
  langitude?: number;
  reviewGoogleId?: string;
  tripadvisorLink?: string;
}

interface UseEstablishmentBySlugResult {
  establishment: EstablishmentData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch establishment data by slug from the API
 * Example: GET /api/mysql/places/by-slug/sur-la-table
 */
export function useEstablishmentBySlug(slug?: string): UseEstablishmentBySlugResult {
  const [establishment, setEstablishment] = useState<EstablishmentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setEstablishment(null);
      setError(null);
      return;
    }

    const fetchEstablishment = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/mysql/places/by-slug/${encodeURIComponent(slug)}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError("Établissement non trouvé");
          } else {
            setError("Erreur lors du chargement de l'établissement");
          }
          setEstablishment(null);
          return;
        }

        const data = await response.json();
        // Map database fields to establishment data
        const establishment: EstablishmentData = {
          placeId: data.placeId,
          name: data.name,
          slug: data.slug,
          logo: data.logo,
          img: data.img,
          banniereImg: data.banniereImg,
          description: data.description,
          address: data.address,
          tagline: data.slogan, // Map slogan to tagline
          nomReseauWifi: data.nomReseauWifi,
          codeWifi: data.codeWifi,
          place_contacts: data.place_contacts || [],
          client: data.client,
          geoFenceEnabled: data.geoFenceEnabled ?? false,
          geoFenceRadiusMeters: data.geoFenceRadiusMeters ?? 0,
          latitude: data.latitude,
          langitude: data.langitude,
          reviewGoogleId: data.reviewGoogleId,
          tripadvisorLink: data.tripadvisorLink,
        };
        setEstablishment(establishment);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
        setEstablishment(null);
      } finally {
        setLoading(false);
      }
    };

    fetchEstablishment();
  }, [slug]);

  return { establishment, loading, error };
}
