import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MenuProduct } from "@/lib/menu-data";
import { getBadgeMeta } from "@/lib/menu-badges";
import { formatDh } from "@/lib/currency";
import { ChevronDown, MessageSquareText, ShoppingCart, ThumbsUp } from "lucide-react";

type Props = {
  product: MenuProduct;
  onAdd: () => void;
  onImageClick?: () => void;
  note: string;
  onNoteChange: (note: string) => void;
  isInCart: boolean;
  isAddDisabled?: boolean;
  className?: string;
  placeId?: number;
  categoryId?: string;
  onVoteUpdate?: (newVotes: number) => void;
};

export function ProductCard({
  product,
  onAdd,
  onImageClick,
  note,
  onNoteChange,
  isInCart,
  isAddDisabled,
  className,
  placeId,
  categoryId,
  onVoteUpdate,
}: Props) {
  const trimmedNote = note.trim();
  const [noteOpen, setNoteOpen] = React.useState(() => trimmedNote.length > 0);
  const [votes, setVotes] = React.useState(product.likes);
  const [isVoting, setIsVoting] = React.useState(false);
  const [hasVoted, setHasVoted] = React.useState(false);

  // Check if user has already voted
  React.useEffect(() => {
    const checkVoteStatus = async () => {
      if (!placeId) return;
      try {
        const res = await fetch(`/api/mysql/menu-items/${product.id}/vote-status?placeId=${placeId}`);
        if (res.ok) {
          const data = await res.json();
          setHasVoted(data.hasVoted);
        }
      } catch (error) {
        console.error("Error checking vote status:", error);
      }
    };

    void checkVoteStatus();
  }, [placeId, product.id]);

  // Handle voting
  const handleVote = async () => {
    if (!placeId) {
      toast.error("Place ID manquant");
      return;
    }

    if (hasVoted) {
      toast.info("Vous avez déjà voté pour ce plat");
      return;
    }

    setIsVoting(true);

    try {
      const res = await fetch(`/api/mysql/menu-items/${product.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId,
          categoryId: categoryId ? parseInt(categoryId) : 0,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setVotes(data.votes);
        setHasVoted(true);
        onVoteUpdate?.(data.votes);
        toast.success("Merci ! Votre vote a été enregistré 👍", {
          duration: 2000,
          className: "border-sam-success/30 bg-sam-success text-white",
        });
      } else if (res.status === 400 && data.alreadyVoted) {
        setHasVoted(true);
        toast.info("Vous avez déjà voté pour ce plat");
      } else {
        toast.error(data.error || "Erreur lors du vote");
      }
    } catch (error) {
      console.error("Error voting:", error);
      toast.error("Erreur lors du vote");
    } finally {
      setIsVoting(false);
    }
  };

  React.useEffect(() => {
    if (trimmedNote.length > 0) setNoteOpen(true);
  }, [trimmedNote]);

  return (
    <article
      className={cn(
        "flex gap-3 border-b border-border px-4 py-4",
        "bg-background",
        className,
      )}
    >
      <div className="w-20 shrink-0">
        <button
          type="button"
          onClick={onImageClick}
          className={cn(
            "h-20 w-20 overflow-hidden rounded-2xl bg-muted block",
            "transition-opacity hover:opacity-80 active:scale-[0.98]",
            onImageClick ? "cursor-pointer" : ""
          )}
          aria-label={`Voir les détails de ${product.title}`}
          title={onImageClick ? "Voir les détails" : undefined}
        >
          <img
            src={product.imageSrc}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </button>

        {(product.badges?.length ?? 0) > 0 && (
          <div className="mt-2 flex w-20 flex-col items-start gap-1.5">
            {(product.badges ?? []).map((b) => {
              if (!b) return null;
              const meta = getBadgeMeta(b);
              if (!meta) return null;
              return (
                <Badge
                  key={b}
                  variant="secondary"
                  className={cn(
                    "h-6 w-full justify-center truncate rounded-full px-2 text-center text-[10px] font-semibold leading-none",
                    meta.className,
                  )}
                  title={meta.label}
                >
                  {meta.label}
                </Badge>
              );
            })}
          </div>
        )}

      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-snug text-foreground">
            {product.title}
          </h3>
          <div className="shrink-0 text-sm font-semibold text-foreground">
            {formatDh(product.priceDh)}
          </div>
        </div>

        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {product.description}
        </p>

        <button
          type="button"
          onClick={handleVote}
          disabled={isVoting || hasVoted}
          className={cn(
            "mt-2 flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
            hasVoted
              ? "text-muted-foreground cursor-not-allowed"
              : "text-muted-foreground hover:bg-secondary/50 hover:text-sam-success cursor-pointer active:scale-95",
            isVoting && "opacity-50 cursor-wait"
          )}
          title={hasVoted ? "Vous avez déjà voté" : "Cliquez pour voter"}
        >
          <ThumbsUp className={cn(
            "h-4 w-4",
            hasVoted ? "text-sam-success fill-sam-success" : "text-sam-success"
          )} />
          <span className="tabular-nums">{votes}</span>
        </button>

        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-between gap-1.5 rounded-lg py-1 pr-1",
              "text-left text-[11px] font-medium text-muted-foreground",
              "transition-colors hover:bg-secondary/50 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
            aria-expanded={noteOpen}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <MessageSquareText className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">
                {trimmedNote.length > 0 ? "Commentaire" : "Ajouter un commentaire"}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform",
                noteOpen && "rotate-180",
              )}
            />
          </button>

          <Button
            onClick={onAdd}
            disabled={isAddDisabled}
            aria-label={isInCart ? "Ajouter +" : "Ajouter"}
            className={cn(
              "h-9 shrink-0 rounded-full px-3",
              "shadow-sm shadow-black/5",
              "active:scale-[0.99]",
            )}
          >
            <ShoppingCart className="h-4 w-4" />
            {isInCart && <span className="ml-1 text-sm font-bold leading-none">+</span>}
          </Button>
        </div>

        {trimmedNote.length > 0 && !noteOpen && (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {trimmedNote}
          </p>
        )}

        {noteOpen && (
          <Input
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Ex: sans oignon, sauce à part…"
            className="mt-2 h-9 rounded-lg text-[16px] sm:text-sm"
          />
        )}
      </div>
    </article>
  );
}
