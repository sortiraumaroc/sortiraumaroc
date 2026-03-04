import { useState } from "react";
import { Bot, Loader2, Sparkles, Languages, FileText, Maximize2, Minimize2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type AIAction =
  | "write_paragraph"
  | "improve_text"
  | "translate_to_english"
  | "translate_to_french"
  | "generate_title"
  | "generate_excerpt"
  | "expand_text"
  | "simplify_text";

type ActionConfig = {
  key: AIAction;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  needsInput: boolean;
  inputPlaceholder?: string;
};

const ACTIONS: ActionConfig[] = [
  {
    key: "write_paragraph",
    label: "Écrire un paragraphe",
    description: "Générer un paragraphe à partir d'un sujet",
    icon: FileText,
    needsInput: true,
    inputPlaceholder: "Décrivez le sujet du paragraphe...",
  },
  {
    key: "improve_text",
    label: "Améliorer le texte",
    description: "Rendre le texte plus fluide et professionnel",
    icon: Sparkles,
    needsInput: true,
    inputPlaceholder: "Collez le texte à améliorer...",
  },
  {
    key: "expand_text",
    label: "Développer",
    description: "Enrichir avec plus de détails",
    icon: Maximize2,
    needsInput: true,
    inputPlaceholder: "Collez le texte à développer...",
  },
  {
    key: "simplify_text",
    label: "Simplifier",
    description: "Rendre plus accessible",
    icon: Minimize2,
    needsInput: true,
    inputPlaceholder: "Collez le texte à simplifier...",
  },
  {
    key: "translate_to_english",
    label: "Traduire → Anglais",
    description: "Traduire le texte français en anglais",
    icon: Languages,
    needsInput: true,
    inputPlaceholder: "Collez le texte français à traduire...",
  },
  {
    key: "translate_to_french",
    label: "Traduire → Français",
    description: "Traduire le texte anglais en français",
    icon: Languages,
    needsInput: true,
    inputPlaceholder: "Collez le texte anglais à traduire...",
  },
  {
    key: "generate_title",
    label: "Générer un titre",
    description: "Créer un titre SEO accrocheur",
    icon: Wand2,
    needsInput: true,
    inputPlaceholder: "Décrivez le contenu de l'article...",
  },
  {
    key: "generate_excerpt",
    label: "Générer un extrait",
    description: "Créer un résumé SEO (120-160 car.)",
    icon: Wand2,
    needsInput: true,
    inputPlaceholder: "Collez le contenu de l'article...",
  },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (text: string) => void;
  initialText?: string;
};

export function AIAssistantDialog({ open, onOpenChange, onInsert, initialText = "" }: Props) {
  const [selectedAction, setSelectedAction] = useState<AIAction | null>(null);
  const [inputText, setInputText] = useState(initialText);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeAction = ACTIONS.find((a) => a.key === selectedAction);

  const handleGenerate = async () => {
    if (!selectedAction || !inputText.trim()) return;

    setLoading(true);
    setError(null);
    setResult("");

    try {
      const response = await fetch("/api/admin/ai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          action: selectedAction,
          text: inputText.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la génération");
      }

      const data = await response.json();
      setResult(data.result || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    if (result) {
      onInsert(result);
      handleClose();
    }
  };

  const handleClose = () => {
    setSelectedAction(null);
    setInputText("");
    setResult("");
    setError(null);
    onOpenChange(false);
  };

  const handleBack = () => {
    setSelectedAction(null);
    setResult("");
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Assistant IA
          </DialogTitle>
          <DialogDescription>
            Utilisez l'intelligence artificielle pour vous aider à rédiger
          </DialogDescription>
        </DialogHeader>

        {!selectedAction ? (
          <div className="grid grid-cols-2 gap-3 mt-4">
            {ACTIONS.map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={() => {
                  setSelectedAction(action.key);
                  if (initialText && action.needsInput) {
                    setInputText(initialText);
                  }
                }}
                className={cn(
                  "flex items-start gap-3 p-4 rounded-lg border border-slate-200 text-start",
                  "hover:border-primary/50 hover:bg-primary/5 transition-all",
                  "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                )}
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <action.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-slate-900">{action.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{action.description}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={handleBack}
                className="text-primary hover:underline"
              >
                ← Retour
              </button>
              <span className="text-slate-400">|</span>
              <span className="font-medium">{activeAction?.label}</span>
            </div>

            {activeAction?.needsInput && (
              <div className="space-y-2">
                <Label>Texte d'entrée</Label>
                <Textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={activeAction.inputPlaceholder}
                  rows={5}
                  className="resize-none"
                />
              </div>
            )}

            <Button
              type="button"
              onClick={handleGenerate}
              disabled={loading || !inputText.trim()}
              className="w-full gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Génération en cours...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Générer
                </>
              )}
            </Button>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {result && (
              <div className="space-y-3">
                <Label>Résultat</Label>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{result}</div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleInsert}
                    className="flex-1 gap-2"
                  >
                    Insérer dans l'éditeur
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(result);
                    }}
                  >
                    Copier
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
