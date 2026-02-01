import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

// ============================================================================
// TYPES
// ============================================================================

type BlockType =
  | "header"
  | "text"
  | "image"
  | "button"
  | "divider"
  | "spacer"
  | "columns"
  | "list"
  | "video"
  | "social"
  | "poll"
  | "countdown";

interface NewsletterBlock {
  id: string;
  type: BlockType;
  content_fr: Record<string, any>;
  content_en: Record<string, any>;
  settings: Record<string, any>;
}

interface Props {
  block: NewsletterBlock;
  lang: "fr" | "en";
  onChange: (updates: Partial<NewsletterBlock>) => void;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function NewsletterBlockEditor({ block, lang, onChange }: Props) {
  const content = lang === "fr" ? block.content_fr : block.content_en;
  const contentKey = lang === "fr" ? "content_fr" : "content_en";

  const updateContent = (key: string, value: any) => {
    onChange({
      [contentKey]: { ...content, [key]: value },
    });
  };

  const updateSettings = (key: string, value: any) => {
    onChange({
      settings: { ...block.settings, [key]: value },
    });
  };

  // ============================================================================
  // RENDER BASED ON BLOCK TYPE
  // ============================================================================

  switch (block.type) {
    case "header":
      return (
        <HeaderBlockEditor
          content={content}
          settings={block.settings}
          onContentChange={updateContent}
          onSettingsChange={updateSettings}
        />
      );

    case "text":
      return (
        <TextBlockEditor
          content={content}
          onContentChange={updateContent}
        />
      );

    case "image":
      return (
        <ImageBlockEditor
          content={content}
          settings={block.settings}
          onContentChange={updateContent}
          onSettingsChange={updateSettings}
        />
      );

    case "button":
      return (
        <ButtonBlockEditor
          content={content}
          settings={block.settings}
          onContentChange={updateContent}
          onSettingsChange={updateSettings}
        />
      );

    case "divider":
      return (
        <DividerBlockEditor
          settings={block.settings}
          onSettingsChange={updateSettings}
        />
      );

    case "spacer":
      return (
        <SpacerBlockEditor
          settings={block.settings}
          onSettingsChange={updateSettings}
        />
      );

    case "columns":
      return (
        <ColumnsBlockEditor
          content={content}
          onContentChange={updateContent}
        />
      );

    case "list":
      return (
        <ListBlockEditor
          content={content}
          settings={block.settings}
          onContentChange={updateContent}
          onSettingsChange={updateSettings}
        />
      );

    case "video":
      return (
        <VideoBlockEditor
          content={content}
          onContentChange={updateContent}
        />
      );

    case "social":
      return (
        <SocialBlockEditor
          content={content}
          onContentChange={updateContent}
        />
      );

    case "poll":
      return (
        <PollBlockEditor
          content={content}
          onContentChange={updateContent}
        />
      );

    case "countdown":
      return (
        <CountdownBlockEditor
          content={content}
          settings={block.settings}
          onContentChange={updateContent}
          onSettingsChange={updateSettings}
        />
      );

    default:
      return <div className="text-slate-400">Type de bloc non supporté</div>;
  }
}

// ============================================================================
// BLOCK EDITORS
// ============================================================================

function HeaderBlockEditor({
  content,
  settings,
  onContentChange,
  onSettingsChange,
}: {
  content: Record<string, any>;
  settings: Record<string, any>;
  onContentChange: (key: string, value: any) => void;
  onSettingsChange: (key: string, value: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Titre</Label>
        <Input
          value={content.title || ""}
          onChange={(e) => onContentChange("title", e.target.value)}
          placeholder="Titre de l'en-tête"
        />
      </div>

      <div className="space-y-2">
        <Label>Sous-titre</Label>
        <Input
          value={content.subtitle || ""}
          onChange={(e) => onContentChange("subtitle", e.target.value)}
          placeholder="Sous-titre (optionnel)"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Couleur de fond</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.backgroundColor || "#D4AF37"}
              onChange={(e) => onSettingsChange("backgroundColor", e.target.value)}
              className="w-8 h-8 rounded border cursor-pointer"
            />
            <Input
              value={settings.backgroundColor || "#D4AF37"}
              onChange={(e) => onSettingsChange("backgroundColor", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Couleur du texte</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.textColor || "#FFFFFF"}
              onChange={(e) => onSettingsChange("textColor", e.target.value)}
              className="w-8 h-8 rounded border cursor-pointer"
            />
            <Input
              value={settings.textColor || "#FFFFFF"}
              onChange={(e) => onSettingsChange("textColor", e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TextBlockEditor({
  content,
  onContentChange,
}: {
  content: Record<string, any>;
  onContentChange: (key: string, value: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Contenu HTML</Label>
        <Textarea
          value={content.html || ""}
          onChange={(e) => onContentChange("html", e.target.value)}
          placeholder="<p>Votre texte ici...</p>"
          rows={8}
          className="font-mono text-sm"
        />
        <p className="text-xs text-slate-500">
          Utilisez du HTML basique: &lt;p&gt;, &lt;strong&gt;, &lt;em&gt;, &lt;a href=&quot;...&quot;&gt;
        </p>
      </div>

      <div className="space-y-2">
        <Label>Variables disponibles</Label>
        <div className="flex flex-wrap gap-2">
          {[
            "{{first_name}}",
            "{{establishment_name}}",
            "{{promo_code}}",
            "{{cta_url}}",
            "{{date}}",
            "{{amount}}",
          ].map((v) => (
            <button
              key={v}
              onClick={() =>
                onContentChange("html", (content.html || "") + v)
              }
              className="px-2 py-1 text-xs bg-slate-100 rounded hover:bg-slate-200"
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ImageBlockEditor({
  content,
  settings,
  onContentChange,
  onSettingsChange,
}: {
  content: Record<string, any>;
  settings: Record<string, any>;
  onContentChange: (key: string, value: any) => void;
  onSettingsChange: (key: string, value: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>URL de l'image</Label>
        <Input
          value={content.url || ""}
          onChange={(e) => onContentChange("url", e.target.value)}
          placeholder="https://... ou {{variable}}"
        />
      </div>

      <div className="space-y-2">
        <Label>Texte alternatif (alt)</Label>
        <Input
          value={content.alt || ""}
          onChange={(e) => onContentChange("alt", e.target.value)}
          placeholder="Description de l'image"
        />
      </div>

      <div className="space-y-2">
        <Label>Lien (optionnel)</Label>
        <Input
          value={content.link || ""}
          onChange={(e) => onContentChange("link", e.target.value)}
          placeholder="URL de destination au clic"
        />
      </div>

      <div className="flex items-center justify-between p-3 border rounded-lg">
        <div>
          <div className="text-sm font-medium">Pleine largeur</div>
          <div className="text-xs text-slate-500">L'image prend toute la largeur</div>
        </div>
        <Switch
          checked={settings.fullWidth || false}
          onCheckedChange={(v) => onSettingsChange("fullWidth", v)}
        />
      </div>

      <div className="space-y-2">
        <Label>Arrondi des coins</Label>
        <Select
          value={settings.borderRadius || "0px"}
          onValueChange={(v) => onSettingsChange("borderRadius", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0px">Aucun</SelectItem>
            <SelectItem value="4px">Léger</SelectItem>
            <SelectItem value="8px">Moyen</SelectItem>
            <SelectItem value="12px">Arrondi</SelectItem>
            <SelectItem value="50%">Cercle</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ButtonBlockEditor({
  content,
  settings,
  onContentChange,
  onSettingsChange,
}: {
  content: Record<string, any>;
  settings: Record<string, any>;
  onContentChange: (key: string, value: any) => void;
  onSettingsChange: (key: string, value: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Texte du bouton</Label>
        <Input
          value={content.text || ""}
          onChange={(e) => onContentChange("text", e.target.value)}
          placeholder="Cliquez ici"
        />
      </div>

      <div className="space-y-2">
        <Label>URL de destination</Label>
        <Input
          value={content.url || ""}
          onChange={(e) => onContentChange("url", e.target.value)}
          placeholder="https://... ou {{cta_url}}"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Couleur de fond</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.backgroundColor || "#D4AF37"}
              onChange={(e) => onSettingsChange("backgroundColor", e.target.value)}
              className="w-8 h-8 rounded border cursor-pointer"
            />
            <Input
              value={settings.backgroundColor || "#D4AF37"}
              onChange={(e) => onSettingsChange("backgroundColor", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Couleur du texte</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.textColor || "#FFFFFF"}
              onChange={(e) => onSettingsChange("textColor", e.target.value)}
              className="w-8 h-8 rounded border cursor-pointer"
            />
            <Input
              value={settings.textColor || "#FFFFFF"}
              onChange={(e) => onSettingsChange("textColor", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Alignement</Label>
        <Select
          value={settings.align || "center"}
          onValueChange={(v) => onSettingsChange("align", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Gauche</SelectItem>
            <SelectItem value="center">Centré</SelectItem>
            <SelectItem value="right">Droite</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Taille</Label>
        <Select
          value={settings.size || "medium"}
          onValueChange={(v) => onSettingsChange("size", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="small">Petit</SelectItem>
            <SelectItem value="medium">Moyen</SelectItem>
            <SelectItem value="large">Grand</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function DividerBlockEditor({
  settings,
  onSettingsChange,
}: {
  settings: Record<string, any>;
  onSettingsChange: (key: string, value: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Couleur de la ligne</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={settings.color || "#E5E7EB"}
            onChange={(e) => onSettingsChange("color", e.target.value)}
            className="w-8 h-8 rounded border cursor-pointer"
          />
          <Input
            value={settings.color || "#E5E7EB"}
            onChange={(e) => onSettingsChange("color", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Épaisseur</Label>
        <Select
          value={settings.thickness || "1px"}
          onValueChange={(v) => onSettingsChange("thickness", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1px">Fine (1px)</SelectItem>
            <SelectItem value="2px">Moyenne (2px)</SelectItem>
            <SelectItem value="3px">Épaisse (3px)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Style</Label>
        <Select
          value={settings.style || "solid"}
          onValueChange={(v) => onSettingsChange("style", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Plein</SelectItem>
            <SelectItem value="dashed">Tirets</SelectItem>
            <SelectItem value="dotted">Pointillés</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function SpacerBlockEditor({
  settings,
  onSettingsChange,
}: {
  settings: Record<string, any>;
  onSettingsChange: (key: string, value: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Hauteur de l'espacement</Label>
        <Select
          value={settings.height || "24px"}
          onValueChange={(v) => onSettingsChange("height", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="8px">Extra petit (8px)</SelectItem>
            <SelectItem value="16px">Petit (16px)</SelectItem>
            <SelectItem value="24px">Moyen (24px)</SelectItem>
            <SelectItem value="32px">Grand (32px)</SelectItem>
            <SelectItem value="48px">Extra grand (48px)</SelectItem>
            <SelectItem value="64px">Très grand (64px)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ColumnsBlockEditor({
  content,
  onContentChange,
}: {
  content: Record<string, any>;
  onContentChange: (key: string, value: any) => void;
}) {
  const columns = content.columns || [];

  const updateColumn = (index: number, field: string, value: string) => {
    const newColumns = [...columns];
    newColumns[index] = { ...newColumns[index], [field]: value };
    onContentChange("columns", newColumns);
  };

  const addColumn = () => {
    if (columns.length >= 4) return;
    onContentChange("columns", [
      ...columns,
      { icon: "⭐", title: "Nouveau", text: "Description" },
    ]);
  };

  const removeColumn = (index: number) => {
    if (columns.length <= 1) return;
    onContentChange(
      "columns",
      columns.filter((_: any, i: number) => i !== index)
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Colonnes ({columns.length})</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={addColumn}
          disabled={columns.length >= 4}
        >
          + Ajouter
        </Button>
      </div>

      {columns.map((col: any, index: number) => (
        <div key={index} className="p-3 border rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Colonne {index + 1}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-red-500"
              onClick={() => removeColumn(index)}
              disabled={columns.length <= 1}
            >
              ×
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Icône / Emoji</Label>
            <Input
              value={col.icon || ""}
              onChange={(e) => updateColumn(index, "icon", e.target.value)}
              placeholder="🎯"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Titre</Label>
            <Input
              value={col.title || ""}
              onChange={(e) => updateColumn(index, "title", e.target.value)}
              placeholder="Titre"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Texte</Label>
            <Input
              value={col.text || ""}
              onChange={(e) => updateColumn(index, "text", e.target.value)}
              placeholder="Description"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Image (optionnel)</Label>
            <Input
              value={col.image || ""}
              onChange={(e) => updateColumn(index, "image", e.target.value)}
              placeholder="URL de l'image"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListBlockEditor({
  content,
  settings,
  onContentChange,
  onSettingsChange,
}: {
  content: Record<string, any>;
  settings: Record<string, any>;
  onContentChange: (key: string, value: any) => void;
  onSettingsChange: (key: string, value: any) => void;
}) {
  const items = content.items || [];

  const updateItem = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    onContentChange("items", newItems);
  };

  const addItem = () => {
    onContentChange("items", [...items, "Nouvel élément"]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    onContentChange(
      "items",
      items.filter((_: any, i: number) => i !== index)
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Style de liste</Label>
        <Select
          value={settings.style || "check"}
          onValueChange={(v) => onSettingsChange("style", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="check">Coches ✓</SelectItem>
            <SelectItem value="bullet">Puces •</SelectItem>
            <SelectItem value="number">Numérotée 1.</SelectItem>
            <SelectItem value="arrow">Flèches →</SelectItem>
            <SelectItem value="star">Étoiles ★</SelectItem>
            <SelectItem value="none">Sans marqueur</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label>Éléments ({items.length})</Label>
        <Button variant="outline" size="sm" onClick={addItem}>
          + Ajouter
        </Button>
      </div>

      {items.map((item: string, index: number) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={item}
            onChange={(e) => updateItem(index, e.target.value)}
            placeholder={`Élément ${index + 1}`}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-red-500"
            onClick={() => removeItem(index)}
            disabled={items.length <= 1}
          >
            ×
          </Button>
        </div>
      ))}
    </div>
  );
}

function VideoBlockEditor({
  content,
  onContentChange,
}: {
  content: Record<string, any>;
  onContentChange: (key: string, value: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>URL de la vidéo (YouTube)</Label>
        <Input
          value={content.url || ""}
          onChange={(e) => onContentChange("url", e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
        />
        <p className="text-xs text-slate-500">
          Copiez l'URL complète de la vidéo YouTube
        </p>
      </div>

      <div className="space-y-2">
        <Label>Image de miniature (optionnel)</Label>
        <Input
          value={content.thumbnail || ""}
          onChange={(e) => onContentChange("thumbnail", e.target.value)}
          placeholder="URL de l'image de prévisualisation"
        />
        <p className="text-xs text-slate-500">
          Si vide, la miniature YouTube sera utilisée
        </p>
      </div>
    </div>
  );
}

function SocialBlockEditor({
  content,
  onContentChange,
}: {
  content: Record<string, any>;
  onContentChange: (key: string, value: any) => void;
}) {
  const socials = [
    { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/..." },
    { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/..." },
    { key: "twitter", label: "Twitter/X", placeholder: "https://twitter.com/..." },
    { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/..." },
    { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/..." },
    { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/..." },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Renseignez les URLs de vos réseaux sociaux
      </p>

      {socials.map((social) => (
        <div key={social.key} className="space-y-2">
          <Label>{social.label}</Label>
          <Input
            value={content[social.key] || ""}
            onChange={(e) => onContentChange(social.key, e.target.value)}
            placeholder={social.placeholder}
          />
        </div>
      ))}
    </div>
  );
}

function PollBlockEditor({
  content,
  onContentChange,
}: {
  content: Record<string, any>;
  onContentChange: (key: string, value: any) => void;
}) {
  const options = content.options || [];

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    onContentChange("options", newOptions);
  };

  const addOption = () => {
    if (options.length >= 6) return;
    onContentChange("options", [...options, `Option ${options.length + 1}`]);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    onContentChange(
      "options",
      options.filter((_: any, i: number) => i !== index)
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Question</Label>
        <Input
          value={content.question || ""}
          onChange={(e) => onContentChange("question", e.target.value)}
          placeholder="Votre question ?"
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Options ({options.length})</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={addOption}
          disabled={options.length >= 6}
        >
          + Ajouter
        </Button>
      </div>

      {options.map((option: string, index: number) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={option}
            onChange={(e) => updateOption(index, e.target.value)}
            placeholder={`Option ${index + 1}`}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-red-500"
            onClick={() => removeOption(index)}
            disabled={options.length <= 2}
          >
            ×
          </Button>
        </div>
      ))}
    </div>
  );
}

function CountdownBlockEditor({
  content,
  settings,
  onContentChange,
  onSettingsChange,
}: {
  content: Record<string, any>;
  settings: Record<string, any>;
  onContentChange: (key: string, value: any) => void;
  onSettingsChange: (key: string, value: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Texte d'introduction</Label>
        <Input
          value={content.text || ""}
          onChange={(e) => onContentChange("text", e.target.value)}
          placeholder="Fin de l'offre dans"
        />
      </div>

      <div className="space-y-2">
        <Label>Date de fin</Label>
        <Input
          type="datetime-local"
          value={content.endDate?.slice(0, 16) || ""}
          onChange={(e) =>
            onContentChange("endDate", e.target.value + ":00.000Z")
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Couleur de fond</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.backgroundColor || "#1a1a1a"}
              onChange={(e) => onSettingsChange("backgroundColor", e.target.value)}
              className="w-8 h-8 rounded border cursor-pointer"
            />
            <Input
              value={settings.backgroundColor || "#1a1a1a"}
              onChange={(e) => onSettingsChange("backgroundColor", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Couleur du texte</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.textColor || "#FFFFFF"}
              onChange={(e) => onSettingsChange("textColor", e.target.value)}
              className="w-8 h-8 rounded border cursor-pointer"
            />
            <Input
              value={settings.textColor || "#FFFFFF"}
              onChange={(e) => onSettingsChange("textColor", e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
