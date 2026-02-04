import * as React from "react";

import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "sam_first_visit_ad_v1";

type FirstVisitAdDialogProps = {
  href?: string;
  title?: string;
  description?: string;
  className?: string;
};

function isInternalHref(href: string) {
  return href.startsWith("/");
}

export function FirstVisitAdDialog({
  href = "/menu",
  title = "Offre du moment",
  description = "Cliquez pour découvrir l'offre et accéder au menu.",
  className,
}: FirstVisitAdDialogProps) {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const alreadySeen = window.localStorage.getItem(STORAGE_KEY);
      if (alreadySeen) return;

      window.localStorage.setItem(STORAGE_KEY, "1");
      setOpen(true);
    } catch {
      // If localStorage is blocked, we still show the ad once for this render.
      setOpen(true);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;

    const timeout = window.setTimeout(() => {
      setOpen(false);
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [open]);

  const handleClick = React.useCallback(() => {
    setOpen(false);

    if (!href) return;

    if (isInternalHref(href)) {
      navigate(href);
      return;
    }

    window.open(href, "_blank", "noopener,noreferrer");
  }, [href, navigate]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className={cn(
          "w-[92vw] max-w-[360px] rounded-3xl border-0 bg-transparent p-0 shadow-none",
          className,
        )}
      >
        <div
          role="link"
          tabIndex={0}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className="overflow-hidden rounded-3xl bg-white shadow-2xl"
        >
          <div className="bg-gradient-to-br from-sam-red to-sam-red/80 px-5 pb-5 pt-7 text-white">
            <DialogHeader className="text-left">
              <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                {title}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-white/85">{description}</DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-3 px-5 py-5">
            <div className="rounded-2xl bg-sam-gray-50 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">5 secondes et ça disparaît…</p>
              <p className="mt-1">Ou cliquez n'importe où sur ce pop-up pour ouvrir le lien.</p>
            </div>

            <Button className="h-12 w-full rounded-2xl bg-sam-red text-white hover:bg-sam-red/90">
              Découvrir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
