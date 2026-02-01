import { useEffect, useState } from "react";
import { Plus, Edit3, Trash2, Loader2, Tag, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import {
  listProCustomLabels,
  createProCustomLabel,
  updateProCustomLabel,
  deleteProCustomLabel,
  type CustomLabel,
} from "@/lib/pro/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  establishmentId: string;
  canWrite: boolean;
  onLabelsChange?: () => void;
};

// Available colors (Tailwind)
const COLORS = [
  { id: "slate", name: "Gris", bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  { id: "red", name: "Rouge", bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
  { id: "orange", name: "Orange", bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  { id: "amber", name: "Ambre", bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  { id: "yellow", name: "Jaune", bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200" },
  { id: "lime", name: "Lime", bg: "bg-lime-100", text: "text-lime-700", border: "border-lime-200" },
  { id: "green", name: "Vert", bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  { id: "emerald", name: "Émeraude", bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  { id: "teal", name: "Teal", bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-200" },
  { id: "cyan", name: "Cyan", bg: "bg-cyan-100", text: "text-cyan-700", border: "border-cyan-200" },
  { id: "sky", name: "Ciel", bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-200" },
  { id: "blue", name: "Bleu", bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  { id: "indigo", name: "Indigo", bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-200" },
  { id: "violet", name: "Violet", bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-200" },
  { id: "purple", name: "Pourpre", bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  { id: "fuchsia", name: "Fuchsia", bg: "bg-fuchsia-100", text: "text-fuchsia-700", border: "border-fuchsia-200" },
  { id: "pink", name: "Rose", bg: "bg-pink-100", text: "text-pink-700", border: "border-pink-200" },
  { id: "rose", name: "Rosé", bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-200" },
];

// Popular emojis for labels
const EMOJI_SUGGESTIONS = ["🏷️", "⭐", "🔥", "❤️", "🌟", "✨", "💎", "🎯", "🏆", "👑", "🎁", "🎉", "🌿", "🍃", "🌸", "🍀", "🧡", "💚", "💙", "💜"];

function getColorClasses(colorId: string) {
  const color = COLORS.find((c) => c.id === colorId) ?? COLORS[0];
  return `${color.bg} ${color.text} ${color.border}`;
}

export function CustomLabelsManager({
  open,
  onOpenChange,
  establishmentId,
  canWrite,
  onLabelsChange,
}: Props) {
  const [labels, setLabels] = useState<CustomLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<CustomLabel | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [labelId, setLabelId] = useState("");
  const [emoji, setEmoji] = useState("🏷️");
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("slate");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listProCustomLabels({ establishmentId });
      setLabels(result.labels);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open, establishmentId]);

  const openCreate = () => {
    setEditingLabel(null);
    setLabelId("");
    setEmoji("🏷️");
    setTitle("");
    setColor("slate");
    setEditorOpen(true);
  };

  const openEdit = (label: CustomLabel) => {
    setEditingLabel(label);
    setLabelId(label.label_id);
    setEmoji(label.emoji);
    setTitle(label.title);
    setColor(label.color);
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim()) return;

    setSaving(true);
    setError(null);

    try {
      if (editingLabel) {
        await updateProCustomLabel({
          establishmentId,
          labelId: editingLabel.id,
          patch: { emoji, title: title.trim(), color },
        });
      } else {
        // Generate label_id from title if not provided
        const finalLabelId = labelId.trim() || title.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
        await createProCustomLabel({
          establishmentId,
          data: {
            label_id: finalLabelId,
            emoji,
            title: title.trim(),
            color,
          },
        });
      }
      setEditorOpen(false);
      await load();
      onLabelsChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (label: CustomLabel) => {
    try {
      await deleteProCustomLabel({ establishmentId, labelId: label.id });
      await load();
      onLabelsChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5" />
              Labels personnalisés
            </DialogTitle>
            <DialogDescription>
              Créez vos propres labels pour catégoriser vos produits.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Existing labels */}
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : labels.length > 0 ? (
              <div className="space-y-2">
                {labels.map((label) => (
                  <div
                    key={label.id}
                    className="flex items-center justify-between p-2 rounded-md border border-slate-200 bg-white"
                  >
                    <div className="flex items-center gap-2">
                      <Badge className={getColorClasses(label.color)}>
                        {label.emoji} {label.title}
                      </Badge>
                      <span className="text-xs text-slate-400">({label.label_id})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={!canWrite}
                        onClick={() => openEdit(label)}
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={!canWrite}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Supprimer ce label ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Ce label sera supprimé. Les produits qui l'utilisent le perdront.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(label)}>
                              Supprimer
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-slate-500">
                Aucun label personnalisé créé.
              </div>
            )}

            {/* Add button */}
            {canWrite && (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={openCreate}
              >
                <Plus className="w-4 h-4" />
                Créer un label
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Label Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingLabel ? "Modifier le label" : "Créer un label"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Preview */}
            <div className="flex items-center justify-center p-4 bg-slate-50 rounded-lg">
              <Badge className={`${getColorClasses(color)} text-base px-3 py-1`}>
                {emoji} {title || "Aperçu"}
              </Badge>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label>Nom du label</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Fait maison"
              />
            </div>

            {/* Emoji */}
            <div className="space-y-2">
              <Label>Emoji</Label>
              <div className="flex flex-wrap gap-1">
                {EMOJI_SUGGESTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    className={`
                      w-8 h-8 rounded-md border text-lg transition
                      ${emoji === e
                        ? "bg-primary/10 border-primary"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                      }
                    `}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <Input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="Ou saisissez un emoji"
                className="mt-2"
                maxLength={4}
              />
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label>Couleur</Label>
              <div className="flex flex-wrap gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColor(c.id)}
                    className={`
                      w-8 h-8 rounded-md border-2 transition
                      ${c.bg}
                      ${color === c.id ? "border-slate-900 ring-2 ring-slate-900/20" : "border-transparent hover:border-slate-300"}
                    `}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-primary text-white hover:bg-primary/90"
              onClick={handleSave}
              disabled={!title.trim() || saving}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingLabel ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
