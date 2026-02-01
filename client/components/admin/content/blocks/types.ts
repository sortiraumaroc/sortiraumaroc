export const CMS_TEXT_STYLE_TOKENS = [
  "default",
  "primary",
  "secondary",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
] as const;

export type CmsTextStyleToken = (typeof CMS_TEXT_STYLE_TOKENS)[number];

export type CmsBlockType =
  | "hero"
  | "rich_text"
  | "accented_text"
  | "cta"
  | "image"
  | "document"
  | "video"
  | "poll"
  | "faq"
  | "toc"
  | "heading"
  | "paragraph"
  | "bullets"
  | "numbered"
  | "callout"
  | "notice"
  | "divider";

export type CmsBlockDraft = {
  localId: string;
  type: CmsBlockType;
  is_enabled: boolean;
  data: Record<string, unknown>;
  data_fr: Record<string, unknown>;
  data_en: Record<string, unknown>;
};

export type CmsBlockCategory = "structure" | "content" | "media" | "interaction";

export type CmsBlockTypeInfo = {
  value: CmsBlockType;
  label: string;
  description: string;
  category: CmsBlockCategory;
  icon: string; // Lucide icon name
};

export const CMS_BLOCK_CATEGORIES: Array<{ value: CmsBlockCategory; label: string }> = [
  { value: "structure", label: "Structure" },
  { value: "content", label: "Contenu" },
  { value: "media", label: "Médias" },
  { value: "interaction", label: "Interaction" },
];

export const CMS_BLOCK_TYPES: CmsBlockTypeInfo[] = [
  // Structure
  { value: "hero", label: "Hero", description: "Bandeau d'en-tête", category: "structure", icon: "LayoutTemplate" },
  { value: "toc", label: "Sommaire", description: "Table des matières", category: "structure", icon: "List" },
  { value: "heading", label: "Titre", description: "Titre H2/H3 + ancre", category: "structure", icon: "Heading" },
  { value: "divider", label: "Séparateur", description: "Ligne de séparation", category: "structure", icon: "Minus" },

  // Contenu
  { value: "paragraph", label: "Paragraphe", description: "Texte simple", category: "content", icon: "AlignLeft" },
  { value: "rich_text", label: "Texte riche", description: "HTML formaté", category: "content", icon: "FileText" },
  { value: "accented_text", label: "Texte accentué", description: "Mise en valeur", category: "content", icon: "Highlighter" },
  { value: "bullets", label: "Liste puces", description: "Liste à puces", category: "content", icon: "ListOrdered" },
  { value: "numbered", label: "Liste num.", description: "Liste numérotée", category: "content", icon: "ListOrdered" },
  { value: "callout", label: "Encart", description: "Info/warning/success", category: "content", icon: "AlertCircle" },
  { value: "notice", label: "Notice", description: "Note / précision", category: "content", icon: "Info" },
  { value: "cta", label: "CTA", description: "Appel à l'action", category: "content", icon: "MousePointerClick" },

  // Médias
  { value: "image", label: "Image", description: "Image + légende", category: "media", icon: "Image" },
  { value: "document", label: "PDF", description: "Téléchargement", category: "media", icon: "FileDown" },
  { value: "video", label: "Vidéo", description: "YouTube/Vimeo", category: "media", icon: "Play" },

  // Interaction
  { value: "poll", label: "Sondage", description: "Vote + résultats", category: "interaction", icon: "Vote" },
  { value: "faq", label: "FAQ", description: "Questions fréquentes", category: "interaction", icon: "HelpCircle" },
];

export function getBlockLabel(type: CmsBlockType): string {
  return CMS_BLOCK_TYPES.find((t) => t.value === type)?.label ?? type;
}

function emptyRecord(): Record<string, unknown> {
  return {};
}

export function createEmptyBlock(type: CmsBlockType): CmsBlockDraft {
  const base: CmsBlockDraft = {
    localId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    type,
    is_enabled: true,
    data: emptyRecord(),
    data_fr: emptyRecord(),
    data_en: emptyRecord(),
  };

  if (type === "toc") {
    return {
      ...base,
      data: { sticky: true },
      data_fr: { title: "Sommaire" },
      data_en: { title: "Table of contents" },
    };
  }

  if (type === "divider") {
    return base;
  }

  if (type === "heading") {
    return {
      ...base,
      data: { level: 2 },
      data_fr: { text: "", anchor: "" },
      data_en: { text: "", anchor: "" },
    };
  }

  if (type === "paragraph") {
    return {
      ...base,
      data_fr: { text: "" },
      data_en: { text: "" },
    };
  }

  if (type === "bullets") {
    return {
      ...base,
      data_fr: { items: [] },
      data_en: { items: [] },
    };
  }

  if (type === "numbered") {
    return {
      ...base,
      data_fr: { items: [] },
      data_en: { items: [] },
    };
  }

  if (type === "callout") {
    return {
      ...base,
      data: { variant: "info" },
      data_fr: { title: "", text: "" },
      data_en: { title: "", text: "" },
    };
  }

  if (type === "notice") {
    return {
      ...base,
      data: { variant: "notice" },
      data_fr: { title: "", text: "" },
      data_en: { title: "", text: "" },
    };
  }

  if (type === "hero") {
    return {
      ...base,
      data: { align: "left", background_url: "" },
      data_fr: { heading: "", subheading: "", cta_label: "", cta_href: "" },
      data_en: { heading: "", subheading: "", cta_label: "", cta_href: "" },
    };
  }

  if (type === "rich_text") {
    return {
      ...base,
      data_fr: { html: "" },
      data_en: { html: "" },
    };
  }

  if (type === "accented_text") {
    return {
      ...base,
      data: { textStyle: "default" satisfies CmsTextStyleToken },
      data_fr: { html: "" },
      data_en: { html: "" },
    };
  }

  if (type === "cta") {
    return {
      ...base,
      data: { variant: "primary" },
      data_fr: { title: "", text: "", button_label: "", button_href: "" },
      data_en: { title: "", text: "", button_label: "", button_href: "" },
    };
  }

  if (type === "image") {
    return {
      ...base,
      data: { src: "", ratio: "auto" },
      data_fr: { alt: "", caption: "" },
      data_en: { alt: "", caption: "" },
    };
  }

  if (type === "document") {
    return {
      ...base,
      data: { url: "", file_name: "", size_bytes: 0 },
      data_fr: { title: "", cta_label: "Télécharger le PDF" },
      data_en: { title: "", cta_label: "Download PDF" },
    };
  }

  if (type === "video") {
    return {
      ...base,
      data: { url: "", provider: "", video_id: "" },
      data_fr: { caption: "" },
      data_en: { caption: "" },
    };
  }

  if (type === "poll") {
    const pollId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    return {
      ...base,
      data: { poll_id: pollId },
      data_fr: { question: "", options: [] },
      data_en: { question: "", options: [] },
    };
  }

  if (type === "faq") {
    return {
      ...base,
      data: { category: "reservations" },
    };
  }

  return base;
}
