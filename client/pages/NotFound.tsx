import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { useI18n } from "@/lib/i18n";
import { addLocalePrefix } from "@/lib/i18n/types";

export default function NotFound() {
  const { t, locale } = useI18n();
  const href = (path: string) => addLocalePrefix(path, locale);

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <div className="container mx-auto px-4 py-20">
        <div className="text-center max-w-2xl mx-auto">
          <div className="text-6xl font-bold text-primary mb-4">404</div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">{t("not_found.title")}</h1>
          <p className="text-slate-600 text-lg mb-8">{t("not_found.body")}</p>
          <div className="flex gap-4 justify-center">
            <Link to={href("/")}>
              <Button className="bg-primary hover:bg-primary/90 text-white">{t("not_found.back_home")}</Button>
            </Link>
            <Link to={href("/results")}>
              <Button variant="outline">{t("not_found.view_results")}</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
