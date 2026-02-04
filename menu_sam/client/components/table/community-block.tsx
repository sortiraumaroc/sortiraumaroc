import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Ghost, Instagram, Music2, Share2, Phone, MessageCircle, Mail, Globe, Facebook, Twitter, MapPin, Star } from "lucide-react";

import { SatisfactionSheet } from "@/components/table/satisfaction-sheet";
import type { PlaceContact } from "@/hooks/use-establishment-by-slug";

type Props = {
  className?: string;
  placeContacts?: PlaceContact[];
  placeId?: number;
  reviewGoogleId?: string;
  tripadvisorLink?: string;
  onReviewSubmission?: () => void;
};

const SOCIAL_HANDLE = "lpbkech";

const FALLBACK_SOCIAL_LINKS: Array<{ label: string; href: string; icon: React.ReactNode }> = [
  {
    label: "Instagram",
    href: `https://instagram.com/${SOCIAL_HANDLE}`,
    icon: <Instagram className="h-4 w-4" />,
  },
  {
    label: "TikTok",
    href: `https://www.tiktok.com/@${SOCIAL_HANDLE}`,
    icon: <Music2 className="h-4 w-4" />,
  },
  {
    label: "Snapchat",
    href: `https://www.snapchat.com/add/${SOCIAL_HANDLE}`,
    icon: <Ghost className="h-4 w-4" />,
  },
];

const CONTACT_ICONS: Record<string, React.ReactNode> = {
  mobile: <Phone className="h-4 w-4" />,
  whatsapp: <MessageCircle className="h-4 w-4" />,
  fixe: <Phone className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  site: <Globe className="h-4 w-4" />,
  facebook: <Facebook className="h-4 w-4" />,
  instagram: <Instagram className="h-4 w-4" />,
  twitter: <Twitter className="h-4 w-4" />,
  waze: <MapPin className="h-4 w-4" />,
  tiktok: <Music2 className="h-4 w-4" />,
  snapchat: <Ghost className="h-4 w-4" />,
};

const CONTACT_LABELS: Record<string, string> = {
  mobile: "Téléphone",
  whatsapp: "WhatsApp",
  fixe: "Téléphone fixe",
  email: "Email",
  site: "Site Web",
  facebook: "Facebook",
  instagram: "Instagram",
  twitter: "Twitter",
  waze: "Waze",
  tiktok: "TikTok",
  snapchat: "Snapchat",
};

const getContactLink = (key: string, value: string): string => {
  const cleanValue = value.trim();

  switch (key) {
    case "mobile":
    case "fixe":
      return `tel:${cleanValue}`;
    case "whatsapp":
      const phoneNumber = cleanValue.replace(/\D/g, '');
      return `https://wa.me/${phoneNumber}`;
    case "email":
      return `mailto:${cleanValue}`;
    case "site":
      return cleanValue.startsWith('http') ? cleanValue : `https://${cleanValue}`;
    case "facebook":
      return cleanValue.startsWith('http') ? cleanValue : `https://facebook.com/${cleanValue}`;
    case "instagram":
      return cleanValue.startsWith('http') ? cleanValue : `https://instagram.com/${cleanValue}`;
    case "twitter":
      return cleanValue.startsWith('http') ? cleanValue : `https://twitter.com/${cleanValue}`;
    case "waze":
      return cleanValue.startsWith('http') ? cleanValue : `https://waze.com/ul?q=${encodeURIComponent(cleanValue)}`;
    case "tiktok":
      return cleanValue.startsWith('http') ? cleanValue : `https://tiktok.com/@${cleanValue}`;
    case "snapchat":
      return cleanValue.startsWith('http') ? cleanValue : `https://snapchat.com/add/${cleanValue}`;
    default:
      return cleanValue;
  }
};

export const CommunityBlock = React.memo(function CommunityBlockComponent(
  { className, placeContacts, placeId, reviewGoogleId, tripadvisorLink, onReviewSubmission }: Props,
) {
  const [socialOpen, setSocialOpen] = React.useState(false);

  const redirectToGoogleReview = React.useCallback(() => {
    if (!reviewGoogleId) return;
    let reviewUrl = reviewGoogleId;
    if (!/^https?:\/\//i.test(reviewUrl)) {
      reviewUrl = `https://search.google.com/local/writereview?placeid=${reviewGoogleId}`;
    }
    window.open(reviewUrl, '_blank');
  }, [reviewGoogleId]);

  const redirectToTripAdvisorReview = React.useCallback(() => {
    if (!tripadvisorLink) return;
    let reviewUrl = tripadvisorLink;
    if (!/^https?:\/\//i.test(reviewUrl)) {
      reviewUrl = `https://www.tripadvisor.fr/${tripadvisorLink}`;
    }
    window.open(reviewUrl, '_blank');
  }, [tripadvisorLink]);

  // Use placeContacts if available, otherwise fallback to hardcoded links
  const socialLinks = React.useMemo(() => {
    if (!placeContacts || placeContacts.length === 0) {
      return FALLBACK_SOCIAL_LINKS;
    }

    return placeContacts.map((contact) => ({
      id: contact.place_contact_id,
      label: CONTACT_LABELS[contact.key] || contact.key,
      href: getContactLink(contact.key, contact.value),
      icon: CONTACT_ICONS[contact.key] || <Globe className="h-4 w-4" />,
      key: contact.key,
      isExternal: !["mobile", "fixe", "whatsapp", "email"].includes(contact.key),
    }));
  }, [placeContacts]);

  return (
    <section className={cn("px-4 py-5", className)} aria-label="Communauté">
      <div className="w-full rounded-3xl bg-sam-gray-50 p-4 sm:p-5 lg:p-6">
        <p className="text-sm font-semibold text-foreground">Partager ou donner votre avis</p>

        <div className="mt-3 space-y-3">




          <Sheet open={socialOpen} onOpenChange={setSocialOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                className={cn(
                  "relative h-12 w-full rounded-2xl bg-sam-red text-primary-foreground",
                  "text-[15px] font-semibold hover:bg-sam-red/90",
                )}
              >
                <span className="absolute left-6 top-1/2 -translate-y-1/2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-foreground/15">
                    <Share2 className="h-4 w-4" />
                  </span>
                </span>
                <span className="mx-auto">Réseaux sociaux</span>
              </Button>
            </SheetTrigger>

            <SheetContent
              side="bottom"
              className="rounded-t-3xl border-t border-border px-4 pb-6 pt-5 sm:px-6"
            >
              <SheetHeader className="text-left">
                <SheetTitle>Réseaux sociaux</SheetTitle>
                <SheetDescription>
                  Rejoignez-nous pour suivre notre actualité.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-3">
                {socialLinks.map((link) => (
                  <Button
                    key={link.id || link.label}
                    asChild={link.isExternal || "label" in link}
                    type="button"
                    variant="secondary"
                    className={cn(
                      "h-12 w-full justify-start rounded-2xl bg-white px-4",
                      "hover:bg-white/90",
                    )}
                    onClick={() => {
                      if (!link.isExternal && !("label" in link)) {
                        window.location.href = link.href;
                        setSocialOpen(false);
                      }
                    }}
                  >
                    {link.isExternal || "label" in link ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex w-full items-center gap-3"
                        onClick={() => setSocialOpen(false)}
                      >
                        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-sam-red/10 text-sam-red ring-1 ring-sam-red/15">
                          {link.icon}
                        </span>
                        <span className="text-[13px] font-semibold text-foreground">
                          {link.label}
                        </span>
                        <span
                          className={cn(
                            "ml-auto inline-flex h-8 items-center rounded-full px-3",
                            "text-xs font-semibold text-sam-red",
                            "bg-sam-red/10 ring-1 ring-sam-red/15",
                          )}
                        >
                          Voir
                        </span>
                      </a>
                    ) : (
                      <div className="flex w-full items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-sam-red/10 text-sam-red ring-1 ring-sam-red/15">
                          {link.icon}
                        </span>
                        <span className="text-[13px] font-semibold text-foreground">
                          {link.label}
                        </span>
                        <span
                          className={cn(
                            "ml-auto inline-flex h-8 items-center rounded-full px-3",
                            "text-xs font-semibold text-sam-red",
                            "bg-sam-red/10 ring-1 ring-sam-red/15",
                          )}
                        >
                          Voir
                        </span>
                      </div>
                    )}
                  </Button>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          <SatisfactionSheet
            placeId={placeId}
            reviewGoogleId={reviewGoogleId}
            tripadvisorLink={tripadvisorLink}
            triggerClassName={cn(
              "h-12 rounded-2xl bg-sam-red text-primary-foreground",
              "text-[15px] font-semibold hover:bg-sam-red/90",
            )}
          />

          {reviewGoogleId ? (


            <Button
              type="button"
              onClick={redirectToGoogleReview}
              className={cn(
                "relative h-12 w-full rounded-2xl bg-sam-red text-primary-foreground",
                "text-[15px] font-semibold hover:bg-sam-red/90",
              )}
            >
              <span className="absolute left-6 top-1/2 -translate-y-1/2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-foreground/15">
                  <Star className="h-4 w-4" />
                </span>
              </span>
              <span className="mx-auto">Laissez un avis google</span>
            </Button>
          ) : null}




          {tripadvisorLink ? (
            <Button
              type="button"
              onClick={redirectToTripAdvisorReview}
              className={cn(
                "relative h-12 w-full rounded-2xl bg-sam-red text-primary-foreground",
                "text-[15px] font-semibold hover:bg-sam-red/90",
              )}
            >
              <span className="absolute left-6 top-1/2 -translate-y-1/2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-foreground/15">
                  <Globe className="h-4 w-4" />
                </span>
              </span>
              <span className="mx-auto">Laissez un avis TripAdvisor</span>
            </Button>

          ) : null}
        </div>
      </div>
    </section>
  );
});
