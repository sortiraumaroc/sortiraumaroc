import { useMemo, useRef, useState } from "react";
import { Camera, Loader2, Trash2, Upload, User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

type Props = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  onUpdated: (newUrl: string | null) => void;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

async function getAccessToken(): Promise<string> {
  const { proSupabase } = await import("@/lib/pro/supabase");
  const { data, error } = await proSupabase.auth.getSession();
  if (error || !data.session) throw new Error("Non authentifié");
  return data.session.access_token;
}

export function PartnerAvatarEditor({
  userId,
  displayName,
  avatarUrl,
  onUpdated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ file: File; preview: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const initials = getInitials(displayName);

  const preview = useMemo(() => {
    if (draft) return draft.preview;
    return avatarUrl;
  }, [avatarUrl, draft]);

  const openPicker = () => {
    fileInputRef.current?.click();
  };

  const onPick = async (file: File | null) => {
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Erreur",
        description: "Seules les images sont acceptées.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Erreur",
        description: "L'image ne doit pas dépasser 5 Mo.",
        variant: "destructive",
      });
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = () => {
      setDraft({ file, preview: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const onSave = async () => {
    if (!draft) {
      setOpen(false);
      return;
    }

    setBusy(true);
    try {
      const token = await getAccessToken();

      // Upload via API
      const formData = new FormData();
      formData.append("avatar", draft.file);

      const res = await fetch("/api/partners/me/avatar", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      onUpdated(data.avatar_url ?? null);
      toast({ title: "Succès", description: "Photo de profil mise à jour." });
      setDraft(null);
      setOpen(false);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setBusy(true);
    try {
      const token = await getAccessToken();

      const res = await fetch("/api/partners/me/avatar", {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      onUpdated(null);
      toast({ title: "Succès", description: "Photo de profil supprimée." });
      setDraft(null);
      setOpen(false);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex flex-col items-center gap-2"
        aria-label="Modifier la photo de profil"
      >
        <div className="relative">
          <Avatar className="h-20 w-20 border-4 border-white shadow-lg">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt="Photo de profil" />
            ) : null}
            <AvatarFallback className="bg-[#a3001d] text-white text-xl font-bold">
              {initials || <User className="w-8 h-8" />}
            </AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-1 -right-1 rounded-full border-2 border-white bg-[#a3001d] text-white p-1.5 shadow-sm group-hover:bg-[#8a0018] transition-colors">
            <Camera className="h-3.5 w-3.5" />
          </div>
        </div>
        <span className="text-xs text-[#a3001d] font-medium group-hover:underline">
          Modifier la photo
        </span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) {
            setOpen(v);
            if (!v) setDraft(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Photo de profil</DialogTitle>
            <DialogDescription>
              Importez une image carrée ou portrait. Elle sera affichée en
              format rond.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-4">
            <Avatar className="h-24 w-24 border-4 border-slate-100">
              {preview ? <AvatarImage src={preview} alt="Aperçu" /> : null}
              <AvatarFallback className="bg-[#a3001d] text-white text-2xl font-bold">
                {initials || <User className="w-10 h-10" />}
              </AvatarFallback>
            </Avatar>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0] ?? null;
                void onPick(file);
                e.currentTarget.value = "";
              }}
            />

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={openPicker}
                disabled={busy}
              >
                <Upload className="h-4 w-4" />
                Importer
              </Button>

              {avatarUrl && (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 text-red-600 hover:text-red-700"
                  onClick={onRemove}
                  disabled={busy}
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer
                </Button>
              )}
            </div>

            <p className="text-xs text-slate-500 text-center">
              Formats acceptés : JPG, PNG, WebP. Taille max : 5 Mo.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={busy || !draft}
              className="bg-[#a3001d] hover:bg-[#8a0018]"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
