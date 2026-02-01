// ============================================================================
// NEWSLETTER PREVIEW COMPONENT
// Renders a visual preview of the newsletter blocks
// ============================================================================

// Branding configuration
const NEWSLETTER_BRANDING = {
  logoUrl: "/Logo_SAM_Officiel.png", // Served from public folder
  slogan: {
    fr: "Découvrez et réservez les meilleures activités au Maroc",
    sloganLine2Fr: "Restaurants, loisirs, wellness et bien plus encore",
    en: "Discover and book the best activities in Morocco",
    sloganLine2En: "Restaurants, leisure, wellness and much more",
  },
  websiteUrl: "https://sortiaumaroc.com",
};

interface DesignSettings {
  backgroundColor: string;
  fontFamily: string;
  headerColor: string;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  borderRadius?: string;
}

interface NewsletterBlock {
  id: string;
  type: string;
  content_fr: Record<string, any>;
  content_en: Record<string, any>;
  settings: Record<string, any>;
}

interface Props {
  blocks: NewsletterBlock[];
  design: DesignSettings;
  lang: "fr" | "en";
  device: "desktop" | "mobile";
}

export function NewsletterPreview({ blocks, design, lang, device }: Props) {
  const containerWidth = device === "mobile" ? "390px" : "100%";

  return (
    <div
      className="border rounded-lg overflow-auto"
      style={{ maxHeight: "600px" }}
    >
      <div
        className="mx-auto"
        style={{
          width: containerWidth,
          maxWidth: "100%",
          backgroundColor: design.backgroundColor,
          fontFamily: design.fontFamily,
          color: design.textColor,
          padding: "20px",
        }}
      >
        {/* Logo & Slogan Header */}
        <div
          style={{
            textAlign: "center",
            padding: "24px 16px 32px",
            borderBottom: "1px solid #E5E7EB",
            marginBottom: "24px",
          }}
        >
          <a
            href={NEWSLETTER_BRANDING.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={NEWSLETTER_BRANDING.logoUrl}
              alt="Sortir Au Maroc"
              style={{ maxWidth: "200px", height: "auto", marginBottom: "16px" }}
            />
          </a>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#666666",
              lineHeight: "1.5",
            }}
          >
            {lang === "fr"
              ? NEWSLETTER_BRANDING.slogan.fr
              : NEWSLETTER_BRANDING.slogan.en}
            <br />
            <span style={{ color: design.headerColor, fontWeight: 500 }}>
              {lang === "fr"
                ? NEWSLETTER_BRANDING.slogan.sloganLine2Fr
                : NEWSLETTER_BRANDING.slogan.sloganLine2En}
            </span>
          </p>
        </div>

        {blocks.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-lg mb-2">Aperçu vide</p>
            <p className="text-sm">Ajoutez des blocs pour voir l'aperçu</p>
          </div>
        ) : (
          blocks.map((block) => (
            <BlockRenderer
              key={block.id}
              block={block}
              lang={lang}
              design={design}
            />
          ))
        )}

        {/* Footer with legal links */}
        {blocks.length > 0 && (
          <div
            style={{
              marginTop: "32px",
              paddingTop: "24px",
              borderTop: "1px solid #E5E7EB",
              textAlign: "center",
              fontSize: "12px",
              color: "#9CA3AF",
            }}
          >
            <p style={{ margin: "0 0 8px" }}>
              {lang === "fr"
                ? "Vous recevez cet email car vous êtes inscrit sur Sortir Au Maroc."
                : "You receive this email because you are registered on Sortir Au Maroc."}
            </p>
            <p style={{ margin: "0" }}>
              <a
                href="#"
                style={{ color: "#6B7280", textDecoration: "underline" }}
              >
                {lang === "fr" ? "Se désabonner" : "Unsubscribe"}
              </a>
              {" | "}
              <a
                href="#"
                style={{ color: "#6B7280", textDecoration: "underline" }}
              >
                {lang === "fr"
                  ? "Politique de confidentialité"
                  : "Privacy Policy"}
              </a>
              {" | "}
              <a
                href="#"
                style={{ color: "#6B7280", textDecoration: "underline" }}
              >
                {lang === "fr" ? "Mentions légales" : "Legal Notice"}
              </a>
            </p>
            <p style={{ margin: "16px 0 0", color: "#D1D5DB" }}>
              © 2026 Sortir Au Maroc. {lang === "fr" ? "Tous droits réservés." : "All rights reserved."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// BLOCK RENDERER
// ============================================================================

function BlockRenderer({
  block,
  lang,
  design,
}: {
  block: NewsletterBlock;
  lang: "fr" | "en";
  design: DesignSettings;
}) {
  const content = lang === "fr" ? block.content_fr : block.content_en;
  const settings = block.settings;

  switch (block.type) {
    case "header":
      return (
        <div
          style={{
            backgroundColor: settings.backgroundColor || design.headerColor,
            color: settings.textColor || "#FFFFFF",
            padding: "32px 24px",
            textAlign: "center",
            borderRadius: design.borderRadius || "8px",
            marginBottom: "16px",
          }}
        >
          <h1
            style={{
              margin: "0 0 8px",
              fontSize: "28px",
              fontWeight: "bold",
            }}
          >
            {content.title || "Titre"}
          </h1>
          {content.subtitle && (
            <p style={{ margin: 0, fontSize: "16px", opacity: 0.9 }}>
              {content.subtitle}
            </p>
          )}
        </div>
      );

    case "text":
      return (
        <div
          style={{
            padding: "16px 0",
            lineHeight: "1.6",
          }}
          dangerouslySetInnerHTML={{ __html: content.html || "" }}
        />
      );

    case "image":
      if (!content.url) {
        return (
          <div
            style={{
              padding: "40px",
              backgroundColor: "#F3F4F6",
              textAlign: "center",
              borderRadius: settings.borderRadius || "8px",
              marginBottom: "16px",
              color: "#9CA3AF",
            }}
          >
            [Image: {content.alt || "non définie"}]
          </div>
        );
      }
      return (
        <div
          style={{
            marginBottom: "16px",
            textAlign: "center",
          }}
        >
          <img
            src={content.url}
            alt={content.alt || ""}
            style={{
              maxWidth: settings.fullWidth ? "100%" : "80%",
              height: "auto",
              borderRadius: settings.borderRadius || "8px",
            }}
          />
        </div>
      );

    case "button":
      const btnPadding =
        settings.size === "large"
          ? "16px 32px"
          : settings.size === "small"
          ? "8px 16px"
          : "12px 24px";
      const btnFontSize =
        settings.size === "large"
          ? "18px"
          : settings.size === "small"
          ? "14px"
          : "16px";

      return (
        <div
          style={{
            textAlign: settings.align || "center",
            padding: "16px 0",
          }}
        >
          <a
            href={content.url || "#"}
            style={{
              display: "inline-block",
              backgroundColor: settings.backgroundColor || design.buttonColor,
              color: settings.textColor || design.buttonTextColor,
              padding: btnPadding,
              borderRadius: design.borderRadius || "8px",
              textDecoration: "none",
              fontWeight: "bold",
              fontSize: btnFontSize,
            }}
          >
            {content.text || "Bouton"}
          </a>
        </div>
      );

    case "divider":
      return (
        <hr
          style={{
            border: "none",
            borderTop: `${settings.thickness || "1px"} ${
              settings.style || "solid"
            } ${settings.color || "#E5E7EB"}`,
            margin: "24px 0",
          }}
        />
      );

    case "spacer":
      return <div style={{ height: settings.height || "24px" }} />;

    case "columns":
      const columns = content.columns || [];
      return (
        <div
          style={{
            display: "flex",
            gap: "16px",
            padding: "16px 0",
            flexWrap: "wrap",
          }}
        >
          {columns.map((col: any, i: number) => (
            <div
              key={i}
              style={{
                flex: `1 1 ${100 / columns.length - 5}%`,
                minWidth: "100px",
                textAlign: "center",
                padding: "16px",
                backgroundColor: "#F9FAFB",
                borderRadius: design.borderRadius || "8px",
              }}
            >
              {col.image ? (
                <img
                  src={col.image}
                  alt={col.title || ""}
                  style={{
                    width: "100%",
                    maxWidth: "120px",
                    height: "auto",
                    borderRadius: "8px",
                    marginBottom: "8px",
                  }}
                />
              ) : col.icon ? (
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>
                  {col.icon}
                </div>
              ) : null}
              <div
                style={{
                  fontWeight: "bold",
                  marginBottom: "4px",
                  color: design.headerColor,
                }}
              >
                {col.title}
              </div>
              <div style={{ fontSize: "14px", color: "#6B7280" }}>
                {col.text}
              </div>
            </div>
          ))}
        </div>
      );

    case "list":
      const items = content.items || [];
      const styleMap: Record<string, string> = {
        check: "✓",
        bullet: "•",
        arrow: "→",
        star: "★",
        number: "",
        none: "",
      };
      const marker = styleMap[settings.style] ?? "•";

      return (
        <ul
          style={{
            padding: "16px 0",
            margin: 0,
            listStyle: "none",
          }}
        >
          {items.map((item: string, i: number) => (
            <li
              key={i}
              style={{
                padding: "8px 0",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <span style={{ color: design.headerColor, fontWeight: "bold" }}>
                {settings.style === "number" ? `${i + 1}.` : marker}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );

    case "video":
      const videoId = extractYouTubeId(content.url);
      const thumbnail =
        content.thumbnail ||
        (videoId
          ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
          : null);

      return (
        <div
          style={{
            padding: "16px 0",
            textAlign: "center",
          }}
        >
          {thumbnail ? (
            <a
              href={content.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                position: "relative",
              }}
            >
              <img
                src={thumbnail}
                alt="Video thumbnail"
                style={{
                  maxWidth: "100%",
                  borderRadius: design.borderRadius || "8px",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: "64px",
                  height: "64px",
                  backgroundColor: "rgba(0,0,0,0.7)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FFFFFF",
                  fontSize: "24px",
                }}
              >
                ▶
              </div>
            </a>
          ) : (
            <div
              style={{
                padding: "40px",
                backgroundColor: "#F3F4F6",
                borderRadius: design.borderRadius || "8px",
                color: "#9CA3AF",
              }}
            >
              [Vidéo: {content.url || "non définie"}]
            </div>
          )}
        </div>
      );

    case "social":
      const socials = [
        { key: "facebook", icon: "f", color: "#1877F2" },
        { key: "instagram", icon: "📷", color: "#E4405F" },
        { key: "twitter", icon: "𝕏", color: "#000000" },
        { key: "linkedin", icon: "in", color: "#0A66C2" },
        { key: "youtube", icon: "▶", color: "#FF0000" },
        { key: "tiktok", icon: "♪", color: "#000000" },
      ].filter((s) => content[s.key]);

      if (socials.length === 0) {
        return (
          <div
            style={{
              padding: "16px",
              textAlign: "center",
              color: "#9CA3AF",
            }}
          >
            [Réseaux sociaux non configurés]
          </div>
        );
      }

      return (
        <div
          style={{
            padding: "16px 0",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
            }}
          >
            {socials.map((s) => (
              <a
                key={s.key}
                href={content[s.key]}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "40px",
                  height: "40px",
                  backgroundColor: s.color,
                  color: "#FFFFFF",
                  borderRadius: "50%",
                  textDecoration: "none",
                  fontWeight: "bold",
                  fontSize: "16px",
                }}
              >
                {s.icon}
              </a>
            ))}
          </div>
        </div>
      );

    case "poll":
      const options = content.options || [];
      return (
        <div
          style={{
            padding: "16px",
            backgroundColor: "#F9FAFB",
            borderRadius: design.borderRadius || "8px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              fontWeight: "bold",
              marginBottom: "16px",
              color: design.headerColor,
            }}
          >
            {content.question || "Question ?"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {options.map((opt: string, i: number) => (
              <div
                key={i}
                style={{
                  padding: "12px 16px",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #E5E7EB",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                {opt}
              </div>
            ))}
          </div>
        </div>
      );

    case "countdown":
      return (
        <div
          style={{
            padding: "24px",
            backgroundColor: settings.backgroundColor || "#1a1a1a",
            color: settings.textColor || "#FFFFFF",
            textAlign: "center",
            borderRadius: design.borderRadius || "8px",
            marginBottom: "16px",
          }}
        >
          <div style={{ marginBottom: "12px", fontSize: "14px" }}>
            {content.text || "Fin de l'offre dans"}
          </div>
          <div
            style={{
              display: "flex",
              gap: "16px",
              justifyContent: "center",
            }}
          >
            {["Jours", "Heures", "Min", "Sec"].map((label) => (
              <div key={label}>
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: "bold",
                    backgroundColor: "rgba(255,255,255,0.1)",
                    padding: "12px 16px",
                    borderRadius: "8px",
                    minWidth: "60px",
                  }}
                >
                  00
                </div>
                <div style={{ fontSize: "12px", marginTop: "4px", opacity: 0.7 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return (
        <div
          style={{
            padding: "16px",
            backgroundColor: "#FEF3C7",
            borderRadius: "8px",
            marginBottom: "16px",
            color: "#92400E",
          }}
        >
          Bloc non reconnu: {block.type}
        </div>
      );
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
  );
  return match ? match[1] : null;
}
