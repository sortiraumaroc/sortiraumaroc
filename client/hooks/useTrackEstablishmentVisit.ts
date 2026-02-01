import { useEffect } from "react";

import { trackEstablishmentVisit } from "@/lib/pro/visits";

export function useTrackEstablishmentVisit(establishmentId: string | undefined) {
  useEffect(() => {
    if (!establishmentId) return;
    void trackEstablishmentVisit({ establishmentId });
  }, [establishmentId]);
}
