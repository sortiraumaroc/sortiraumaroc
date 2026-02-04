import * as React from "react";

export type Place = {
  placeId: number;
  name: string;
  slug?: string | null;
  logo?: string | null;
  [key: string]: any; // Allow other fields from API
};

export type ProPlaceContextType = {
  places: Place[];
  selectedPlaceId: number | null;
  setSelectedPlaceId: (placeId: number) => void;
  isLoading: boolean;
  error: string | null;
};

export const ProPlaceContext = React.createContext<ProPlaceContextType | undefined>(undefined);

export function ProPlaceProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: number | null;
}) {
  const [places, setPlaces] = React.useState<Place[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = React.useState<number | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Load places when userId changes
  React.useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      setPlaces([]);
      setSelectedPlaceId(null);
      return;
    }

    const fetchPlaces = async () => {
      try {
        setIsLoading(true);
        setError(null);

        console.log("[ProPlaceContext] Fetching places for userId:", userId);
        const response = await fetch(`/api/mysql/places/client/${userId}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch places: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log("[ProPlaceContext] Fetched places:", data);
        const placesArray = Array.isArray(data) ? data : [data];

        if (placesArray.length === 0) {
          console.warn("[ProPlaceContext] No places found for userId:", userId);
          setError("Aucun établissement trouvé");
          setPlaces([]);
          setSelectedPlaceId(null);
          return;
        }

        console.log("[ProPlaceContext] Setting places:", placesArray);
        setPlaces(placesArray);
        // Set to the first place by default
        setSelectedPlaceId(placesArray[0].placeId);
        console.log("[ProPlaceContext] Selected first place:", placesArray[0].placeId);
      } catch (err) {
        console.error("[ProPlaceContext] Error fetching places:", err);
        setError(err instanceof Error ? err.message : "Erreur lors du chargement des établissements");
        setPlaces([]);
        setSelectedPlaceId(null);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchPlaces();
  }, [userId]);

  // Persist selected place to localStorage
  React.useEffect(() => {
    if (selectedPlaceId !== null) {
      try {
        localStorage.setItem("pro_selected_place_id", selectedPlaceId.toString());
      } catch {
        // ignore localStorage errors
      }
    }
  }, [selectedPlaceId]);

  const handleSetSelectedPlaceId = React.useCallback((placeId: number) => {
    // Verify the placeId exists in places
    if (places.some((p) => p.placeId === placeId)) {
      setSelectedPlaceId(placeId);
    }
  }, [places]);

  return (
    <ProPlaceContext.Provider
      value={{
        places,
        selectedPlaceId,
        setSelectedPlaceId: handleSetSelectedPlaceId,
        isLoading,
        error,
      }}
    >
      {children}
    </ProPlaceContext.Provider>
  );
}

export function useProPlace(): ProPlaceContextType {
  const context = React.useContext(ProPlaceContext);
  if (context === undefined) {
    throw new Error("useProPlace must be used within a ProPlaceProvider");
  }
  return context;
}
