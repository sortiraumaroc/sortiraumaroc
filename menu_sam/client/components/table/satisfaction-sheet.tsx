import * as React from "react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PenLine, ExternalLink, AlertCircle } from "lucide-react";

type Props = {
  triggerClassName?: string;
  className?: string;
  placeId?: number;
  reviewGoogleId?: string;
  tripadvisorLink?: string;

};

export function SatisfactionSheet({ triggerClassName, className, placeId, reviewGoogleId, tripadvisorLink }: Props) {
  const [open, setOpen] = React.useState(false);
  const [rating, setRating] = React.useState<number | null>(null);
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);


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

  // ✅ iOS keyboard offset
  const [kbOffset, setKbOffset] = React.useState(0);

  React.useEffect(() => {
    if (!open) {
      // Reset submitted state when closing the sheet
      setSubmitted(false);
      return;
    }

    const vv = window.visualViewport;
    if (!vv) return;

    const handler = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbOffset(offset);
    };

    handler();
    vv.addEventListener("resize", handler);
    vv.addEventListener("scroll", handler);

    return () => {
      vv.removeEventListener("resize", handler);
      vv.removeEventListener("scroll", handler);
      setKbOffset(0);
    };
  }, [open]);

  const canSubmit = rating !== null;

  function reset() {
    setRating(null);
    setNote("");
  }

  async function submit() {
    if (!canSubmit) return;

    if (!placeId) {
      toast.error("Établissement non trouvé");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/mysql/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId,
          note: rating,
          comment: note.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.text().catch(() => "Erreur inconnue");
        console.error("Review submission error:", error);
        toast.error("Erreur lors de l'envoi de l'avis");
        return;
      }

      setSubmitted(true);
      reset();
    } catch (error) {
      console.error("Error submitting review:", error);
      toast.error("Erreur lors de l'envoi de l'avis");
    } finally {
      setSubmitting(false);
    }
  }
  const hasGoogle = Boolean(reviewGoogleId);
  const hasTripAdvisor = Boolean(tripadvisorLink);

  const reviewText =
    hasGoogle && hasTripAdvisor
      ? "Pourriez-vous nous laisser un avis sur Google ou TripAdvisor pour nous aider ?"
      : hasGoogle
        ? "Pourriez-vous nous laisser un avis sur Google pour nous aider ?"
        : hasTripAdvisor
          ? "Pourriez-vous nous laisser un avis sur TripAdvisor pour nous aider ?"
          : null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          className={cn(
            "relative w-full",
            triggerClassName ??
            cn(
              "h-12 rounded-2xl bg-sam-red text-primary-foreground",
              "text-[15px] font-semibold hover:bg-sam-red/90",
            ),
          )}
        >
          <span className="absolute left-6 top-1/2 -translate-y-1/2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-foreground/15">
              <PenLine className="h-4 w-4" />
            </span>
          </span>
          <span className="mx-auto">Avis express</span>
        </Button>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${kbOffset}px + 16px)` }}
        className={cn(
          "rounded-t-3xl border-t border-border px-4 pt-5 sm:px-6",
          "flex max-h-[85vh] flex-col",
          className,
        )}
      >
        <SheetHeader>
          <SheetTitle>Votre avis</SheetTitle>
          <SheetDescription>
            30 secondes. Juste l’essentiel pour améliorer votre expérience.
          </SheetDescription>
        </SheetHeader>

        {/* ✅ scrollable content */}
        <div className="mt-4 flex-1 overflow-y-auto [-webkit-overflow-scrolling:touch]">
          {!submitted ? (
            <div className="space-y-5 pb-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Satisfaction générale</p>
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Button
                      key={n}
                      type="button"
                      variant={rating === n ? "default" : "secondary"}
                      onClick={() => setRating(n)}
                      className={cn(
                        "h-10 rounded-2xl",
                        rating === n
                          ? "bg-sam-red text-primary-foreground hover:bg-sam-red/90"
                          : "bg-sam-gray-50 text-foreground hover:bg-sam-gray-100",
                      )}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
              </div>


              {rating !== null && rating >= 4 && reviewText && (
                <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                  <p className="text-sm font-semibold text-green-900">
                    Merci beaucoup ! 🎉
                  </p>

                  <p className="mt-2 text-sm text-green-700">
                    {reviewText}
                  </p>

                  <div className="mt-3 flex gap-2">
                    {hasGoogle && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={redirectToGoogleReview}
                        className="flex-1 h-10 rounded-xl text-sm font-semibold"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Google
                      </Button>
                    )}

                    {hasTripAdvisor && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={redirectToTripAdvisorReview}
                        className="flex-1 h-10 rounded-xl text-sm font-semibold"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        TripAdvisor
                      </Button>
                    )}
                  </div>
                </div>
              )}


              {rating !== null && rating <= 3 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-amber-900">Nous vous prions de nous excuser</p>
                      <p className="mt-2 text-sm text-amber-800">
                        Veuillez accepter nos sincères excuses. Nous n'avons pas été à la hauteur de vos attentes et prenons votre retour très au sérieux afin de nous améliorer. N'hésitez pas à en parler avec un responsable.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-foreground">Un mot (optionnel)</p>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex : Tout était top, merci !"
                  className={cn("mt-2 min-h-[84px] rounded-2xl", "text-base text-[16px]")}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    reset();
                    setOpen(false);
                  }}
                  disabled={submitting}
                  className="h-12 flex-1 rounded-2xl bg-sam-gray-50"
                >
                  Fermer
                </Button>
                <Button
                  type="button"
                  disabled={!canSubmit || submitting}
                  onClick={() => void submit()}
                  className={cn(
                    "h-12 flex-1 rounded-2xl bg-sam-red text-primary-foreground",
                    "disabled:bg-sam-red/40",
                  )}
                >
                  {submitting ? "Envoi..." : "Envoyer"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="rounded-2xl border border-green-200 bg-green-50 p-6 w-full">
                <p className="text-2xl font-bold text-green-900">Merci beaucoup ! 🎉</p>
                <p className="mt-4 text-sm text-green-700">
                  Pourriez-vous nous laisser un avis sur Google ou TripAdvisor pour nous aider ?
                </p>
                <div className="mt-6 flex gap-3 flex-col">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      window.open("https://www.google.com/maps", "_blank");
                    }}
                    className="h-11 rounded-2xl text-sm font-semibold"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Avis Google
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      window.open("https://www.tripadvisor.com", "_blank");
                    }}
                    className="h-11 rounded-2xl text-sm font-semibold"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Avis TripAdvisor
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
                className="mt-4 h-11 w-full rounded-2xl bg-sam-gray-50"
              >
                Fermer
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
