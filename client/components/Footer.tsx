import { Link } from "react-router-dom";

import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { useI18n } from "@/lib/i18n";
import { addLocalePrefix } from "@/lib/i18n/types";

function DisabledFooterLink(props: { children: string }) {
  const { t } = useI18n();

  return (
    <span
      className="opacity-60 cursor-not-allowed"
      aria-disabled="true"
      title={t("common.coming_soon")}
    >
      {props.children}
    </span>
  );
}

export function Footer() {
  const { t, locale } = useI18n();
  const year = 2026;

  const href = (path: string) => addLocalePrefix(path, locale);

  const contentHref = (frSlug: string, enSlug: string = frSlug) => {
    const slug = locale === "en" ? enSlug : frSlug;
    return href(`/content/${slug}`);
  };

  return (
    <footer className="bg-black border-t border-black pt-12 -mb-[3px]">
      <div className="container mx-auto px-4 font-['Intra',_sans-serif] font-normal">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-8">
          <div>
            <h4 className="font-bold mb-3 text-white">{t("footer.brand")}</h4>
            <ul className="space-y-2 text-sm text-white">
              <li>
                <Link
                  to={contentHref("decouvrir", "discover")}
                  className="hover:text-primary"
                >
                  {t("footer.link.discover")}
                </Link>
              </li>
              <li>
                <Link
                  to={contentHref("a-propos", "about")}
                  className="hover:text-primary"
                >
                  {t("footer.link.about")}
                </Link>
              </li>
              <li>
                <Link
                  to={contentHref("contact", "contact")}
                  className="hover:text-primary"
                >
                  {t("footer.link.contact")}
                </Link>
              </li>
              <li>
                <Link
                  to={href("/blog")}
                  className="hover:text-primary"
                >
                  {t("footer.link.blog")}
                </Link>
              </li>
              <li>
                <Link
                  to={href("/videos")}
                  className="hover:text-primary"
                >
                  {t("footer.link.videos")}
                </Link>
              </li>
              <li>
                <Link
                  to={contentHref("carrieres", "careers")}
                  className="hover:text-primary"
                >
                  {t("footer.link.careers")}
                </Link>
              </li>
            </ul>

            <div className="mt-4">
              <LanguageSwitcher
                variant="footer"
                className="border-white/20 bg-black text-white hover:bg-white/5"
              />
            </div>
          </div>
          <div>
            <h4 className="font-bold mb-3 text-white">
              {t("footer.section.partners")}
            </h4>
            <ul className="space-y-2 text-sm text-white">
              <li>
                <Link to={href("/parrainage")} className="hover:text-primary">
                  {t("footer.link.become_sponsor")}
                </Link>
              </li>
              <li>
                <Link to="/partners" className="hover:text-primary">
                  {t("footer.link.partner_space")}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-3 text-white">
              {t("footer.section.professionals")}
            </h4>
            <ul className="space-y-2 text-sm text-white">
              <li>
                <Link
                  to={`${href("/pro")}?mode=signup`}
                  className="hover:text-primary"
                >
                  {t("footer.link.create_pro_account")}
                </Link>
              </li>
              <li>
                <Link to={href("/pro")} className="hover:text-primary">
                  {t("footer.link.pro_space")}
                </Link>
              </li>
              <li>
                <Link
                  to={`${href("/pro")}?section=pricing`}
                  className="hover:text-primary"
                >
                  {t("footer.link.pricing_offers")}
                </Link>
              </li>
              <li>
                <Link
                  to={`${href("/pro")}?section=features`}
                  className="hover:text-primary"
                >
                  {t("footer.link.features")}
                </Link>
              </li>
              <li>
                <Link
                  to={`${href("/pro")}?section=demo`}
                  className="hover:text-primary"
                >
                  {t("footer.link.request_demo")}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-3 text-white">
              {t("footer.section.legal")}
            </h4>
            <ul className="space-y-2 text-sm text-white">
              <li>
                <Link
                  to={contentHref("conditions-utilisation", "terms-of-use")}
                  className="hover:text-primary"
                >
                  {t("footer.link.terms")}
                </Link>
              </li>
              <li>
                <Link
                  to={contentHref(
                    "politique-confidentialite",
                    "privacy-policy",
                  )}
                  className="hover:text-primary"
                >
                  {t("footer.link.privacy")}
                </Link>
              </li>
              <li>
                <Link
                  to={contentHref("mentions-legales", "legal-notice")}
                  className="hover:text-primary"
                >
                  {t("footer.link.legal_notice")}
                </Link>
              </li>
              <li>
                <Link
                  to={contentHref(
                    "charte-etablissements",
                    "partner-venue-charter",
                  )}
                  className="hover:text-primary"
                >
                  {t("footer.link.partner_charter")}
                </Link>
              </li>
              <li>
                <Link
                  to={contentHref("politique-remboursement", "refund-policy")}
                  className="hover:text-primary"
                >
                  {t("footer.link.refund_policy")}
                </Link>
              </li>
              <li>
                <Link
                  to={contentHref(
                    "politique-anti-no-show",
                    "anti-no-show-policy",
                  )}
                  className="hover:text-primary"
                >
                  {t("footer.link.anti_no_show_policy")}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-3 text-white">
              {t("footer.section.download_app")}
            </h4>
            <div className="flex flex-col gap-2 text-sm text-white">
              <DisabledFooterLink>
                {t("footer.link.apple_store")}
              </DisabledFooterLink>
              <DisabledFooterLink>
                {t("footer.link.google_play")}
              </DisabledFooterLink>
            </div>

            <NewsletterSignup />
          </div>
        </div>
        <div className="bg-black pb-8 pt-16 mt-[19px] text-center text-sm text-white">
          <p className="mt-[3px]">
            &copy; {year}{" "}
            <Link
              to="/admin"
              className="underline underline-offset-2 hover:text-primary"
              aria-label={t("footer.link.admin_aria")}
            >
              {t("footer.brand")}
            </Link>
            {t("footer.copyright_suffix")}
          </p>
        </div>
      </div>
    </footer>
  );
}
