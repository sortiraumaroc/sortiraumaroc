import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";

import { Header } from "@/components/Header";
import { getPublicHomeCities, type PublicHomeCity } from "@/lib/publicApi";
import { applySeo } from "@/lib/seo";

export default function Cities() {
  const [cities, setCities] = useState<PublicHomeCity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await getPublicHomeCities();
        if (!cancelled) {
          setCities(res.cities ?? []);
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applySeo({
      title: "Villes au Maroc - Sortir Au Maroc",
      description:
        "Explorez toutes les villes du Maroc et découvrez les meilleurs établissements : restaurants, hôtels, loisirs et plus encore.",
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          Villes au Maroc
        </h1>
        <p className="text-slate-600 mb-8">
          Découvrez les meilleures adresses dans chaque ville du Maroc
        </p>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[4/3] rounded-xl bg-slate-200 animate-pulse"
              />
            ))}
          </div>
        ) : cities.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <MapPin className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">Aucune ville disponible pour le moment</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {cities.map((city) => (
              <Link
                key={city.id}
                to={`/villes/${city.slug}`}
                className="group relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-100"
              >
                {city.image_url ? (
                  <img
                    src={city.image_url}
                    alt={city.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300">
                    <MapPin className="w-10 h-10 text-slate-400" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <span className="text-white font-bold text-lg drop-shadow-lg">
                    {city.name}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
