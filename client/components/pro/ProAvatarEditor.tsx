import { useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Camera, Trash2, Upload } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fileToAvatarDataUrl } from "@/lib/profilePhoto";
import { proSupabase } from "@/lib/pro/supabase";

function getProAvatarDataUrl(user: User): string | null {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const v = meta.pro_avatar_data_url;
  return typeof v === "string" && v.startsWith("data:image/") ? v : null;
}

async function setProAvatarDataUrl(dataUrl: string | null) {
  await proSupabase.auth.updateUser({
    data: {
      pro_avatar_data_url: dataUrl,
    },
  });
}

type Props = {
  user: User;
  initials: string;
};

export function ProAvatarEditor({ user, initials }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const saved = useMemo(() => getProAvatarDataUrl(user), [user]);

  const preview = useMemo(() => {
    if (draft) return draft;
    if (saved) return saved;
    return null;
  }, [draft, saved]);

  const openPicker = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  const onPick = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fileToAvatarDataUrl(file);
      if (res.ok === false) {
        setError(res.message);
        return;
      }
      setDraft(res.dataUrl);
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    setBusy(true);
    setError(null);

    try {
      if (!draft) {
        setOpen(false);
        return;
      }

      await setProAvatarDataUrl(draft);
      setDraft(null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setBusy(true);
    setError(null);

    try {
      await setProAvatarDataUrl(null);
      setDraft(null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setDraft(null);
          setError(null);
          setBusy(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="group flex items-center" aria-label="Modifier la photo de profil">
          <div className="relative">
            <Avatar className="h-10 w-10 border-2 border-primary/20">
              {saved ? <AvatarImage src={saved} alt="Photo de profil" /> : null}
              <AvatarFallback className="bg-primary text-white font-bold">{initials}</AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 rounded-full border-2 border-white bg-primary text-white p-1 shadow-sm group-hover:bg-primary/90 transition-colors">
              <Camera className="h-3.5 w-3.5" />
            </div>
          </div>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Photo de profil</DialogTitle>
          <DialogDescription>Importez une image. Elle sera compressée automatiquement.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-primary/20">
            {preview ? <AvatarImage src={preview} alt="Aperçu" /> : null}
            <AvatarFallback className="bg-primary text-white font-bold">{initials}</AvatarFallback>
          </Avatar>

          <div className={"grid gap-2 w-full max-w-[320px]" + (saved ? " grid-cols-2" : " grid-cols-1")}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0] ?? null;
                void onPick(file);
                e.currentTarget.value = "";
              }}
            />

            <Button type="button" variant="outline" className="gap-2 rounded-xl" onClick={openPicker} disabled={busy}>
              <Upload className="h-4 w-4" />
              Importer
            </Button>

            {saved ? (
              <Button
                type="button"
                variant="outline"
                className="gap-2 rounded-xl text-red-600 hover:text-red-700"
                onClick={() => void onRemove()}
                disabled={busy}
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </Button>
            ) : null}
          </div>
        </div>

        {error ? <div className="text-sm font-medium text-red-600">{error}</div> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Fermer
          </Button>
          <Button type="button" className="bg-primary hover:bg-primary/90 text-white" onClick={() => void onSave()} disabled={busy}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
