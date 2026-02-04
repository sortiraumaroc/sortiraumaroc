import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeId?: number;
  className?: string;
};

export function ReviewSubmissionDialog({
  open,
  onOpenChange,
  placeId,
  className,
}: Props) {
  const [rating, setRating] = React.useState<number>(0);
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    if (!placeId) {
      toast.error("Établissement non trouvé");
      return;
    }

    if (rating === 0) {
      toast.error("Veuillez sélectionner une note");
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
          comment: comment.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.text().catch(() => "Erreur inconnue");
        console.error("Review submission error:", error);
        toast.error("Erreur lors de l'envoi de l'avis");
        return;
      }

      toast.success("Merci ! Votre avis a été envoyé", { duration: 2000 });
      setRating(0);
      setComment("");
      onOpenChange(false);
    } catch (error) {
      console.error("Error submitting review:", error);
      toast.error("Erreur lors de l'envoi de l'avis");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("w-[92vw] max-w-[360px] rounded-3xl p-5", className)}>
        <DialogHeader className="text-left">
          <DialogTitle className="text-lg">Avis Express</DialogTitle>
          <DialogDescription className="text-sm">
            Partagez votre expérience et aidez-nous à nous améliorer
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-4">
          {/* Rating Stars */}
          <div>
            <p className="mb-3 text-sm font-medium">Votre note</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="transition-transform active:scale-110"
                  aria-label={`Note ${star} sur 5`}
                >
                  <Star
                    className={cn(
                      "h-8 w-8 transition-colors",
                      star <= rating
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300"
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Comment TextArea */}
          <div>
            <label htmlFor="comment" className="text-sm font-medium">
              Commentaire (optionnel)
            </label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Partagez vos impressions..."
              className={cn(
                "mt-2 w-full rounded-xl border border-gray-300 bg-white p-3 text-sm",
                "placeholder:text-gray-400",
                "focus:border-sam-red focus:outline-none focus:ring-1 focus:ring-sam-red",
                "resize-none"
              )}
              rows={4}
              maxLength={500}
            />
            <p className="mt-1 text-xs text-gray-500">
              {comment.length}/500
            </p>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={submitting || rating === 0}
            className={cn(
              "h-12 w-full rounded-2xl font-medium",
              submitting || rating === 0
                ? "bg-gray-300 text-gray-500"
                : "bg-sam-red text-white hover:bg-sam-red/90"
            )}
          >
            {submitting ? "Envoi en cours..." : "Envoyer l'avis"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
