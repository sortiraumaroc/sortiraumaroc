export type FixedContentPageKey = "about" | "contact" | "careers" | "terms" | "privacy" | "faq";

export type FixedContentPageDefinition = {
  key: FixedContentPageKey;
  label: string;
  contentId: number;
};

// MODE A (MySQL schema "content" table):
// IDs are an application-side mapping (not stored in DB). Adjust these IDs to match your MySQL database.
export const FIXED_CONTENT_PAGES: readonly FixedContentPageDefinition[] = [
  { key: "about", label: "About", contentId: 1 },
  { key: "contact", label: "Contact", contentId: 2 },
  { key: "careers", label: "Careers", contentId: 3 },
  { key: "terms", label: "Terms", contentId: 4 },
  { key: "privacy", label: "Privacy", contentId: 5 },
  { key: "faq", label: "FAQ", contentId: 6 },
] as const;

export function getFixedContentPageDefinition(key: string): FixedContentPageDefinition | null {
  const k = String(key || "").trim().toLowerCase();
  return (FIXED_CONTENT_PAGES as readonly FixedContentPageDefinition[]).find((p) => p.key === k) ?? null;
}
