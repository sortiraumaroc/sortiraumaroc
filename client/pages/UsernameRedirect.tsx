import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { getPublicEstablishment, type PublicEstablishment } from "@/lib/publicApi";
import { buildEstablishmentUrl } from "@/lib/establishmentUrl";

/**
 * Redirect from /@username to the correct establishment page (e.g., /restaurant/slug)
 */
export function UsernameRedirect() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function resolveAndRedirect() {
      if (!username) {
        setError("Nom d'utilisateur invalide");
        return;
      }

      try {
        // Fetch the establishment using the username
        const establishment = await getPublicEstablishment(username);

        if (!establishment) {
          setError("Établissement non trouvé");
          return;
        }

        // Build the correct URL and redirect
        const url = buildEstablishmentUrl({
          id: establishment.id,
          slug: establishment.slug,
          universe: establishment.universe,
        });

        // Replace the current URL to avoid back-button issues
        navigate(url, { replace: true });
      } catch (e) {
        console.error("Error resolving username:", e);
        setError("Établissement non trouvé");
      }
    }

    resolveAndRedirect();
  }, [username, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Établissement non trouvé
          </h1>
          <p className="text-slate-600 mb-4">
            L'établissement @{username} n'existe pas ou n'est plus disponible.
          </p>
          <a
            href="/"
            className="text-primary hover:underline font-medium"
          >
            Retour à l'accueil
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-slate-600">Redirection en cours...</p>
      </div>
    </div>
  );
}
