import { Link } from "react-router-dom";

import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { getSocialIcon } from "@/components/ui/SocialIcons";
import { useI18n } from "@/lib/i18n";
import { addLocalePrefix } from "@/lib/i18n/types";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

const SOCIAL_PLATFORMS = [
  { key: "social_instagram", platform: "instagram" },
  { key: "social_tiktok", platform: "tiktok" },
  { key: "social_facebook", platform: "facebook" },
  { key: "social_youtube", platform: "youtube" },
  { key: "social_snapchat", platform: "snapchat" },
  { key: "social_linkedin", platform: "linkedin" },
] as const;

export function Footer() {
  const { t, locale } = useI18n();
  const { settings } = usePlatformSettings();
  const year = 2026;

  const href = (path: string) => addLocalePrefix(path, locale);

  const contentHref = (frSlug: string, enSlug: string = frSlug) => {
    const slug = locale === "en" ? enSlug : frSlug;
    return href(`/content/${slug}`);
  };

  const footer = settings?.footer;
  const activeSocials = SOCIAL_PLATFORMS.filter(
    (s) => footer?.[s.key as keyof typeof footer],
  );

  return (
    <footer className="bg-black border-t border-black pt-10 -mb-[3px]">
      <div className="container mx-auto px-4 font-['Inter',_sans-serif] font-normal">

        {/* ==================== Mobile only: Social Icons + Newsletter ==================== */}
        <div className="pb-8 border-b border-white/10 lg:hidden">
          {activeSocials.length > 0 && (
            <div className="flex items-center justify-center gap-5">
              {activeSocials.map(({ key, platform }) => (
                <a
                  key={key}
                  href={footer![key as keyof typeof footer]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/60 hover:text-white transition-colors"
                  aria-label={platform}
                >
                  {getSocialIcon(platform, "w-5 h-5")}
                </a>
              ))}
            </div>
          )}

          {/* Newsletter — right below social icons */}
          <div className="mt-6 max-w-md mx-auto">
            <NewsletterSignup />
          </div>
        </div>

        {/* ==================== Link Columns (+ Social/Newsletter on desktop) ==================== */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 py-8">

          {/* Column 1: Découvrir (merged Brand + Partners) */}
          <div>
            <h4 className="font-semibold mb-3 text-white text-sm">
              {t("footer.section.discover")}
            </h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li>
                <Link to={contentHref("decouvrir", "discover")} className="hover:text-white transition-colors">
                  {t("footer.link.discover")}
                </Link>
              </li>
              <li>
                <Link to={contentHref("a-propos", "about")} className="hover:text-white transition-colors">
                  {t("footer.link.about")}
                </Link>
              </li>
              <li>
                <Link to={contentHref("contact", "contact")} className="hover:text-white transition-colors">
                  {t("footer.link.contact")}
                </Link>
              </li>
              <li>
                <Link to={href("/blog")} className="hover:text-white transition-colors">
                  {t("footer.link.blog")}
                </Link>
              </li>
              <li>
                <Link to={href("/videos")} className="hover:text-white transition-colors">
                  {t("footer.link.videos")}
                </Link>
              </li>
              <li>
                <Link to={contentHref("carrieres", "careers")} className="hover:text-white transition-colors">
                  {t("footer.link.careers")}
                </Link>
              </li>
              <li>
                <Link to={href("/parrainage")} className="hover:text-white transition-colors">
                  {t("footer.link.become_sponsor")}
                </Link>
              </li>
              <li>
                <Link to="/partners" className="hover:text-white transition-colors">
                  {t("footer.link.partner_space")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: Professionnels */}
          <div>
            <h4 className="font-semibold mb-3 text-white text-sm">
              {t("footer.section.professionals")}
            </h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li>
                <Link to={`${href("/pro")}?mode=signup`} className="hover:text-white transition-colors">
                  {t("footer.link.create_pro_account")}
                </Link>
              </li>
              <li>
                <Link to={href("/pro")} className="hover:text-white transition-colors">
                  {t("footer.link.pro_space")}
                </Link>
              </li>
              <li>
                <Link to={`${href("/pro")}?section=pricing`} className="hover:text-white transition-colors">
                  {t("footer.link.pricing_offers")}
                </Link>
              </li>
              <li>
                <Link to={`${href("/pro")}?section=features`} className="hover:text-white transition-colors">
                  {t("footer.link.features")}
                </Link>
              </li>
              <li>
                <Link to={`${href("/pro")}?section=demo`} className="hover:text-white transition-colors">
                  {t("footer.link.request_demo")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Légal */}
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-3 text-white text-sm">
              {t("footer.section.legal")}
            </h4>
            <ul className="space-y-2 text-sm text-white/70 columns-2 md:columns-1">
              <li>
                <Link to={contentHref("conditions-utilisation", "terms-of-use")} className="hover:text-white transition-colors">
                  {t("footer.link.terms")}
                </Link>
              </li>
              <li>
                <Link to={contentHref("politique-confidentialite", "privacy-policy")} className="hover:text-white transition-colors">
                  {t("footer.link.privacy")}
                </Link>
              </li>
              <li>
                <Link to={contentHref("mentions-legales", "legal-notice")} className="hover:text-white transition-colors">
                  {t("footer.link.legal_notice")}
                </Link>
              </li>
              <li>
                <Link to={contentHref("charte-etablissements", "partner-venue-charter")} className="hover:text-white transition-colors">
                  {t("footer.link.partner_charter")}
                </Link>
              </li>
              <li>
                <Link to={contentHref("politique-remboursement", "refund-policy")} className="hover:text-white transition-colors">
                  {t("footer.link.refund_policy")}
                </Link>
              </li>
              <li>
                <Link to={contentHref("politique-anti-no-show", "anti-no-show-policy")} className="hover:text-white transition-colors">
                  {t("footer.link.anti_no_show_policy")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Social + Newsletter (desktop only) */}
          <div className="hidden lg:block col-span-1">
            <h4 className="font-semibold mb-3 text-white text-sm">
              {t("footer.section.follow_us")}
            </h4>
            {activeSocials.length > 0 && (
              <div className="flex items-center gap-4 mb-5">
                {activeSocials.map(({ key, platform }) => (
                  <a
                    key={key}
                    href={footer![key as keyof typeof footer]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/60 hover:text-white transition-colors"
                    aria-label={platform}
                  >
                    {getSocialIcon(platform, "w-5 h-5")}
                  </a>
                ))}
              </div>
            )}
            <NewsletterSignup />
          </div>
        </div>

        {/* ==================== ZONE 3: App + Utils ==================== */}
        <div className="border-t border-white/10 py-8">
          <div className="flex flex-wrap items-center justify-center gap-4">

            {/* Language switcher */}
            <LanguageSwitcher
              variant="footer"
              className="border-white/20 bg-black text-white hover:bg-white/5"
            />
          </div>
        </div>

        {/* ==================== Logo + Copyright ==================== */}
        <div className="border-t border-white/10 py-6 flex flex-col items-center gap-4">
          <Link to={href("/")} className="shrink-0">
            <img
              src="/logo-white.png"
              alt={t("footer.brand")}
              className="h-8 w-auto"
            />
          </Link>
          <p className="text-sm text-white/50">
            &copy; {year}{" "}
            <span>{t("footer.brand")}</span>
            {t("footer.copyright_suffix")}
          </p>
        </div>
      </div>

    </footer>
  );
}
