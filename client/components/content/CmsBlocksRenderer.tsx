import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { addLocalePrefix } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { sanitizeRichTextHtml } from "@/lib/richText";
import { FaqSection } from "@/components/support/FaqSection";
import { PollBlock } from "@/components/content/PollBlock";

export type ResolvedCmsBlock = {
  id: string;
  sort_order: number;
  type: string;
  data: unknown;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function slugifyAnchor(input: string): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

type VideoUrls = { embedUrl: string; thumbnailUrl: string };

function buildVideoUrls(provider: string, videoId: string): VideoUrls | null {
  const p = String(provider ?? "").trim().toLowerCase();
  const id = String(videoId ?? "").trim();
  if (!id) return null;

  if (p === "youtube") {
    return {
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }

  if (p === "vimeo") {
    return {
      embedUrl: `https://player.vimeo.com/video/${id}?dnt=1`,
      thumbnailUrl: `https://vumbnail.com/${id}.jpg`,
    };
  }

  return null;
}

function isAllowedVideoUrl(url: string): boolean {
  const raw = String(url ?? "").trim();
  if (!raw) return false;

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  return host === "youtube-nocookie.com" || host === "player.vimeo.com" || host === "i.ytimg.com" || host === "vumbnail.com";
}

type LazyVideoEmbedProps = {
  title: string;
  embedUrl: string;
  thumbnailUrl: string;
  playLabel: string;
};

function LazyVideoEmbed({ title, embedUrl, thumbnailUrl, playLabel }: LazyVideoEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (active) return;

    const el = containerRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setActive(true);
      },
      { rootMargin: "200px 0px", threshold: 0.15 },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [active]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-black"
      style={{ paddingTop: "56.25%" }}
    >
      {active ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={embedUrl}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="origin"
        />
      ) : (
        <button
          type="button"
          className="absolute inset-0 h-full w-full"
          onClick={() => setActive(true)}
          aria-label={playLabel}
        >
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          <span className="absolute inset-0 bg-black/20" aria-hidden />
          <span className="absolute inset-0 grid place-items-center" aria-hidden>
            <span className="rounded-full bg-black/60 p-4 text-white">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

type Props = {
  blocks: ResolvedCmsBlock[];
  className?: string;
  blogSlug?: string;
};

export function CmsBlocksRenderer({ blocks, className, blogSlug }: Props) {
  const { locale, t } = useI18n();
  const href = (path: string) => addLocalePrefix(path, locale);

  const tocItems = blocks
    .filter((b) => b.type === "heading")
    .map((b) => {
      const data = asRecord(b.data);
      const text = asString(data.text);
      const levelRaw = data.level;
      const level = typeof levelRaw === "number" && Number.isFinite(levelRaw) ? Math.max(2, Math.min(3, Math.round(levelRaw))) : 2;
      const anchor = asString(data.anchor) || slugifyAnchor(text);
      return anchor && text ? { anchor, text, level } : null;
    })
    .filter((v): v is { anchor: string; text: string; level: number } => !!v);

  if (!blocks.length) return null;

  return (
    <div className={cn("space-y-8", className)}>
      {blocks.map((block) => {
        const data = asRecord(block.data);

        if (block.type === "toc") {
          const title = asString(data.title);
          const sticky = Boolean(asRecord(block.data).sticky ?? true);

          if (!tocItems.length) return null;

          const list = (
            <nav aria-label={title || t("content.toc")}>
              <ul className="space-y-2 text-sm">
                {tocItems.map((item) => (
                  <li key={item.anchor} className={cn(item.level === 3 ? "pl-3" : "")}>
                    <a href={`#${item.anchor}`} className="text-slate-700 hover:text-primary hover:underline">
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          );

          return (
            <section
              key={block.id}
              className={cn(
                "rounded-lg border border-slate-200 bg-white",
                sticky ? "md:sticky md:top-24" : "",
              )}
            >
              <div className="md:hidden">
                <Accordion type="single" collapsible>
                  <AccordionItem value="toc">
                    <AccordionTrigger className="px-4">{title || t("content.toc")}</AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">{list}</AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>

              <div className="hidden md:block p-5">
                <div className="text-sm font-extrabold text-slate-900">{title || t("content.toc")}</div>
                <div className="mt-3">{list}</div>
              </div>
            </section>
          );
        }

        if (block.type === "divider") {
          return <hr key={block.id} className="border-slate-200" />;
        }

        if (block.type === "heading") {
          const text = asString(data.text);
          const levelRaw = data.level;
          const level = typeof levelRaw === "number" && Number.isFinite(levelRaw) ? Math.max(2, Math.min(3, Math.round(levelRaw))) : 2;
          const anchor = asString(data.anchor) || slugifyAnchor(text);

          if (!text) return null;

          if (level === 3) {
            return (
              <section key={block.id}>
                <h3 id={anchor || undefined} className="text-lg md:text-xl font-bold text-foreground mt-6">
                  {text}
                </h3>
              </section>
            );
          }

          return (
            <section key={block.id}>
              <h2 id={anchor || undefined} className="text-xl md:text-2xl font-extrabold text-foreground mt-8">
                {text}
              </h2>
            </section>
          );
        }

        if (block.type === "paragraph") {
          const text = asString(data.text);
          if (!text) return null;
          return (
            <section key={block.id}>
              <p className="text-slate-800 leading-relaxed">{text}</p>
            </section>
          );
        }

        if (block.type === "bullets" || block.type === "numbered") {
          const itemsRaw = data.items;
          const items = Array.isArray(itemsRaw) ? itemsRaw.map((v) => String(v ?? "").trim()).filter(Boolean) : [];
          if (!items.length) return null;

          const List = block.type === "numbered" ? "ol" : "ul";
          const listClass = block.type === "numbered" ? "list-decimal" : "list-disc";

          return (
            <section key={block.id}>
              <List className={cn("pl-6 space-y-2 text-slate-800", listClass)}>
                {items.map((item, idx) => (
                  <li key={`${block.id}-${idx}`} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </List>
            </section>
          );
        }

        if (block.type === "callout" || block.type === "notice") {
          const variant = asString(data.variant) || (block.type === "notice" ? "notice" : "info");
          const title = asString(data.title);
          const text = asString(data.text);

          if (!title && !text) return null;

          const style =
            variant === "warning"
              ? "border-amber-200 bg-amber-50"
              : variant === "success"
                ? "border-emerald-200 bg-emerald-50"
                : variant === "notice"
                  ? "border-slate-200 bg-slate-50"
                  : "border-sky-200 bg-sky-50";

          return (
            <section key={block.id} className={cn("rounded-lg border p-5", style)}>
              {title ? <div className="text-sm font-extrabold text-foreground">{title}</div> : null}
              {text ? <p className={cn("text-slate-800", title ? "mt-2" : "")} style={{ whiteSpace: "pre-wrap" }}>{text}</p> : null}
            </section>
          );
        }

        if (block.type === "hero") {
          const heading = asString(data.heading);
          const subheading = asString(data.subheading);
          const ctaLabel = asString(data.cta_label);
          const ctaHref = asString(data.cta_href) || "#";
          const localizedCtaHref = ctaHref.startsWith("/") ? href(ctaHref) : ctaHref;
          const backgroundUrl = asString(data.background_url);
          const align = asString(data.align) || "left";

          return (
            <section
              key={block.id}
              className={cn(
                "rounded-lg border border-slate-200 overflow-hidden",
                backgroundUrl ? "bg-slate-900" : "bg-primary/5",
              )}
            >
              <div
                className={cn("p-6 md:p-10", align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left")}
                style={
                  backgroundUrl
                    ? {
                        backgroundImage: `linear-gradient(rgba(2,6,23,0.55), rgba(2,6,23,0.55)), url(${backgroundUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
              >
                <div className={cn(backgroundUrl ? "text-white" : "text-slate-900")}>
                  {heading ? <h2 className="text-2xl md:text-4xl font-extrabold">{heading}</h2> : null}
                  {subheading ? <p className={cn("mt-3 text-base md:text-lg", backgroundUrl ? "text-white/90" : "text-slate-700")}>{subheading}</p> : null}

                  {ctaLabel ? (
                    <div className={cn("mt-6", align === "right" ? "flex justify-end" : align === "center" ? "flex justify-center" : "")}> 
                      {ctaHref.startsWith("/") || ctaHref.startsWith("#") ? (
                        <Link to={localizedCtaHref}>
                          <Button className="font-semibold">{ctaLabel}</Button>
                        </Link>
                      ) : (
                        <a href={ctaHref} target="_blank" rel="noreferrer">
                          <Button className="font-semibold">{ctaLabel}</Button>
                        </a>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          );
        }

        if (block.type === "accented_text") {
          const html = sanitizeRichTextHtml(asString(data.html));
          const textStyleRaw = asString(data.textStyle) || "default";
          const textStyle = (
            ["default", "primary", "secondary", "accent", "success", "warning", "danger", "info"] as const
          ).includes(textStyleRaw as any)
            ? (textStyleRaw as
                | "default"
                | "primary"
                | "secondary"
                | "accent"
                | "success"
                | "warning"
                | "danger"
                | "info")
            : "default";

          if (!html.trim()) return null;

          return (
            <section
              key={block.id}
              className={cn(
                "cms-accented-text leading-relaxed",
                `cms-text-style--${textStyle}`,
                "[&_p]:mb-4 [&_p:last-child]:mb-0",
                "[&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:mt-6 [&_h2]:mb-3",
                "[&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-5 [&_h3]:mb-2",
                "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6",
                "[&_li]:my-1",
                "[&_a]:text-primary [&_a:hover]:underline",
                "[&_strong]:font-bold",
              )}
            >
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </section>
          );
        }

        if (block.type === "rich_text") {
          const html = sanitizeRichTextHtml(asString(data.html));
          return (
            <section key={block.id} className="prose prose-slate max-w-none">
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </section>
          );
        }

        if (block.type === "cta") {
          const title = asString(data.title);
          const text = asString(data.text);
          const buttonLabel = asString(data.button_label);
          const buttonHref = asString(data.button_href) || "#";
          const localizedButtonHref = buttonHref.startsWith("/") ? href(buttonHref) : buttonHref;

          return (
            <section key={block.id} className="rounded-lg border border-slate-200 bg-slate-50 p-6 md:p-8">
              <div className="max-w-3xl">
                {title ? <h3 className="text-xl font-extrabold text-foreground">{title}</h3> : null}
                {text ? <p className="mt-2 text-slate-700">{text}</p> : null}
                {buttonLabel ? (
                  <div className="mt-5">
                    {buttonHref.startsWith("/") || buttonHref.startsWith("#") ? (
                      <Link to={localizedButtonHref}>
                        <Button className="font-semibold">{buttonLabel}</Button>
                      </Link>
                    ) : (
                      <a href={buttonHref} target="_blank" rel="noreferrer">
                        <Button className="font-semibold">{buttonLabel}</Button>
                      </a>
                    )}
                  </div>
                ) : null}
              </div>
            </section>
          );
        }

        if (block.type === "image") {
          const src = asString(data.src);
          const alt = asString(data.alt);
          const caption = asString(data.caption);

          if (!src) return null;

          return (
            <figure key={block.id} className="space-y-2">
              <img src={src} alt={alt} className="w-full rounded-lg border border-slate-200" />
              {caption ? <figcaption className="text-sm text-slate-600">{caption}</figcaption> : null}
            </figure>
          );
        }

        if (block.type === "document") {
          const url = asString(data.url);
          const title = asString(data.title);
          const ctaLabel = asString(data.cta_label);
          const fileName = asString(data.file_name);
          const sizeBytes = typeof data.size_bytes === "number" && Number.isFinite(data.size_bytes) ? Math.max(0, Math.floor(data.size_bytes)) : 0;

          if (!url) return null;

          const humanSize = (n: number): string => {
            if (!n) return "";
            const kb = n / 1024;
            if (kb < 1024) return `${Math.round(kb)} KB`;
            const mb = kb / 1024;
            return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
          };

          const defaultLabel = locale === "en" ? "Download" : "Télécharger";

          return (
            <section key={block.id} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
              {title ? <div className="text-sm font-extrabold text-foreground">{title}</div> : null}
              {fileName || sizeBytes ? (
                <div className={cn("text-xs text-slate-600", title ? "mt-1" : "")}>{[fileName, humanSize(sizeBytes)].filter(Boolean).join(" · ")}</div>
              ) : null}
              <div className={cn(title || fileName || sizeBytes ? "mt-4" : "")}>
                <a href={url} target="_blank" rel="noreferrer">
                  <Button className="font-semibold">{ctaLabel || defaultLabel}</Button>
                </a>
              </div>
            </section>
          );
        }

        if (block.type === "video") {
          const provider = asString(data.provider);
          const videoId = asString(data.video_id);
          const embedUrlFromServer = asString(data.embed_url);
          const thumbnailUrlFromServer = asString(data.thumbnail_url);
          const caption = asString(data.caption);

          const computed = buildVideoUrls(provider, videoId);
          const embedUrl = (embedUrlFromServer && isAllowedVideoUrl(embedUrlFromServer) ? embedUrlFromServer : computed?.embedUrl) ?? "";
          const thumbnailUrl =
            (thumbnailUrlFromServer && isAllowedVideoUrl(thumbnailUrlFromServer) ? thumbnailUrlFromServer : computed?.thumbnailUrl) ?? "";

          if (!embedUrl || !thumbnailUrl) return null;

          const playLabel = locale === "en" ? "Play video" : "Lire la vidéo";

          return (
            <section key={block.id} className="space-y-2">
              <LazyVideoEmbed title={caption || "Video"} embedUrl={embedUrl} thumbnailUrl={thumbnailUrl} playLabel={playLabel} />
              {caption ? <div className="text-sm text-slate-600">{caption}</div> : null}
            </section>
          );
        }

        if (block.type === "poll") {
          const pollId = asString(data.poll_id);
          const question = asString(data.question);
          const optionsRaw = data.options;
          const options = Array.isArray(optionsRaw) ? optionsRaw.map((v) => String(v ?? "").trim()).filter(Boolean) : [];

          if (!blogSlug) return null;
          if (!pollId || !question || options.length < 2) return null;

          return <PollBlock key={block.id} slug={blogSlug} pollId={pollId} question={question} options={options} />;
        }

        if (block.type === "faq") {
          const category = asString(data.category) || "all";
          return <FaqSection key={block.id} defaultCategory={category as any} compact />;
        }

        return null;
      })}
    </div>
  );
}
