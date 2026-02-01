export type AllowedRichTextTag =
  | "p"
  | "br"
  | "strong"
  | "b"
  | "em"
  | "i"
  | "u"
  | "h2"
  | "h3"
  | "ul"
  | "ol"
  | "li"
  | "a";

const ALLOWED_TAGS = new Set<AllowedRichTextTag>([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "a",
]);

function isSafeHref(href: string): boolean {
  const v = href.trim();
  if (!v) return false;
  if (v.startsWith("/")) return true;
  if (v.startsWith("#")) return true;
  if (v.startsWith("mailto:")) return true;
  if (v.startsWith("tel:")) return true;

  try {
    const url = new URL(v);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function unwrapElement(el: Element) {
  const parent = el.parentNode;
  if (!parent) return;

  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

export function sanitizeRichTextHtml(html: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html || "", "text/html");

    const walk = (node: Node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tag = el.tagName.toLowerCase();

        if (!ALLOWED_TAGS.has(tag as AllowedRichTextTag)) {
          unwrapElement(el);
          return;
        }

        // Strip all attributes except safe ones.
        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
          const name = attr.name.toLowerCase();
          if (tag === "a") {
            if (name === "href") continue;
            if (name === "target") continue;
            if (name === "rel") continue;
          }
          el.removeAttribute(attr.name);
        }

        if (tag === "a") {
          const href = el.getAttribute("href") ?? "";
          if (!isSafeHref(href)) {
            el.removeAttribute("href");
          }

          // Always enforce safe rel/target when linking away.
          const target = el.getAttribute("target") ?? "";
          if (target === "_blank") {
            el.setAttribute("rel", "noopener noreferrer");
          } else {
            el.removeAttribute("target");
            el.removeAttribute("rel");
          }
        }
      }

      const children = Array.from(node.childNodes);
      for (const child of children) walk(child);
    };

    walk(doc.body);

    // Collapse empty wrappers introduced by execCommand.
    const cleanup = () => {
      const empty = Array.from(doc.body.querySelectorAll("p, h2, h3"))
        .filter((el) => (el.textContent ?? "").trim() === "" && el.querySelectorAll("br").length <= 1)
        .slice(0, 200);
      for (const el of empty) {
        if (el.tagName.toLowerCase() === "p") {
          // Keep a single empty paragraph if it's the only content.
          if (doc.body.children.length === 1) continue;
        }
        el.remove();
      }
    };

    cleanup();

    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

export function stripHtmlToText(html: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html || "", "text/html");
    return (doc.body.textContent ?? "").trim();
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

function cleanPastedText(raw: string): string {
  return String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    // common invisible garbage
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    // normalize nbsp
    .replace(/\u00A0/g, " ")
    // collapse trailing spaces per line
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .trim();
}

function buildHtmlFromPlainText(text: string): string {
  const cleaned = cleanPastedText(text);
  if (!cleaned) return "";

  const doc = document.implementation.createHTMLDocument("");
  const body = doc.body;

  // Split by blank lines into paragraphs.
  const paragraphs: string[] = [];
  const lines = cleaned.split("\n");
  let current: string[] = [];

  const pushParagraph = () => {
    const p = current.join("\n").trim();
    if (p) paragraphs.push(p);
    current = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      pushParagraph();
      continue;
    }
    current.push(line);
  }
  pushParagraph();

  for (const pText of paragraphs) {
    const p = doc.createElement("p");

    const innerLines = pText.split("\n");
    innerLines.forEach((l, idx) => {
      if (idx > 0) p.appendChild(doc.createElement("br"));
      p.appendChild(doc.createTextNode(l));
    });

    body.appendChild(p);
  }

  return body.innerHTML;
}

function normalizeDocumentStructure(doc: Document): void {
  const body = doc.body;

  // Clean text nodes across the whole tree.
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  for (const node of textNodes) {
    const next = cleanPastedText(node.nodeValue ?? "");
    node.nodeValue = next;
  }

  // Wrap stray text nodes at root into <p> blocks to guarantee stable HTML.
  const blockTags = new Set(["p", "h2", "h3", "ul", "ol"]);
  const rootNodes = Array.from(body.childNodes);

  for (const n of rootNodes) {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = (n.nodeValue ?? "").trim();
      if (!t) {
        n.remove();
        continue;
      }

      const p = doc.createElement("p");
      p.appendChild(doc.createTextNode(t));
      body.replaceChild(p, n);
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const tag = (n as Element).tagName.toLowerCase();

      // Convert accidental single-line divs/spans that slipped through into paragraphs.
      if (!blockTags.has(tag) && tag !== "a" && tag !== "br" && tag !== "strong" && tag !== "b" && tag !== "em" && tag !== "i" && tag !== "u" && tag !== "li") {
        // If it contains text, wrap it.
        const text = (n.textContent ?? "").trim();
        if (!text) {
          n.remove();
          continue;
        }

        const p = doc.createElement("p");
        p.appendChild(doc.createTextNode(text));
        body.replaceChild(p, n);
      }
    }
  }

  // Fix orphan <li> elements by wrapping them in <ul>.
  const orphanLis = Array.from(body.children).filter((el) => el.tagName.toLowerCase() === "li");
  if (orphanLis.length) {
    const ul = doc.createElement("ul");
    for (const li of orphanLis) ul.appendChild(li);
    body.appendChild(ul);
  }

  // Collapse repeated <br> at the root.
  const brs = Array.from(body.querySelectorAll("br"));
  for (const br of brs) {
    const next = br.nextSibling;
    if (next && next.nodeType === Node.ELEMENT_NODE && (next as Element).tagName.toLowerCase() === "br") {
      br.remove();
    }
  }
}

export function cleanClipboardToRichTextHtml(args: { html?: string; text?: string }): { html: string; text: string } {
  const htmlRaw = String(args.html ?? "");
  const textRaw = String(args.text ?? "");

  const fallbackText = cleanPastedText(textRaw);

  // Prefer HTML when available (keeps headings/lists) but sanitize aggressively.
  if (htmlRaw.trim()) {
    const sanitized = sanitizeRichTextHtml(htmlRaw);

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(sanitized || "", "text/html");
      normalizeDocumentStructure(doc);

      const normalized = doc.body.innerHTML.trim();
      if (normalized) return { html: normalized, text: fallbackText };
    } catch {
      // fall back to plain text
    }
  }

  // Fallback: generate minimal safe HTML from text.
  const fromText = buildHtmlFromPlainText(fallbackText);
  if (fromText) return { html: fromText, text: fallbackText };

  return { html: "", text: fallbackText };
}

export type StandardCmsBlockSpec =
  | { type: "heading"; data: { level: 2 | 3 }; locale: { text: string; anchor?: string } }
  | { type: "paragraph"; locale: { text: string } }
  | { type: "bullets"; locale: { items: string[] } }
  | { type: "numbered"; locale: { items: string[] } }
  | { type: "divider" }
  | { type: "image"; data: { src: string; ratio?: string }; locale?: { alt?: string; caption?: string } }
  | { type: "rich_text"; locale: { html: string } };

function isSafeHttpUrl(raw: string): boolean {
  const v = String(raw ?? "").trim();
  if (!v) return false;
  try {
    const url = new URL(v);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isDividerText(text: string): boolean {
  const v = String(text ?? "").trim();
  if (!v) return false;
  return /^(-{3,}|_{3,}|\*{3,})$/.test(v);
}

function looksLikeImageUrl(text: string): boolean {
  const v = String(text ?? "").trim();
  if (!isSafeHttpUrl(v)) return false;
  return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(v);
}

function elementHasInlineMarkup(el: Element): boolean {
  return Boolean(el.querySelector("a,strong,b,em,i,u,br"));
}

function pushParagraphFromText(out: StandardCmsBlockSpec[], text: string) {
  const v = String(text ?? "").trim();
  if (!v) return;
  if (isDividerText(v)) {
    out.push({ type: "divider" });
    return;
  }
  if (looksLikeImageUrl(v)) {
    out.push({ type: "image", data: { src: v, ratio: "auto" } });
    return;
  }
  out.push({ type: "paragraph", locale: { text: v } });
}

function flattenInterestingNodes(node: Node, out: Node[]) {
  const interesting = new Set(["h2", "h3", "p", "ul", "ol", "hr", "img"]);

  const walk = (n: Node) => {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as Element;
      const tag = el.tagName.toLowerCase();

      if (interesting.has(tag)) {
        out.push(el);
        return;
      }

      // Common wrappers from Google Docs / Word / emails.
      if (["div", "span", "section", "article", "main", "body"].includes(tag)) {
        for (const child of Array.from(el.childNodes)) walk(child);
        return;
      }

      // Default: still scan children so we don't lose headings/lists nested in wrappers.
      for (const child of Array.from(el.childNodes)) walk(child);
      return;
    }

    if (n.nodeType === Node.TEXT_NODE) {
      const t = String(n.nodeValue ?? "").trim();
      if (t) out.push(n);
    }
  };

  walk(node);
}

function blocksFromCleanHtml(cleanHtml: string, rawHtml: string): StandardCmsBlockSpec[] | null {
  const cleaned = String(cleanHtml ?? "").trim();
  const raw = String(rawHtml ?? "").trim();
  if (!cleaned && !raw) return null;

  const out: StandardCmsBlockSpec[] = [];

  // Extract images from raw HTML first (sanitization strips <img>).
  try {
    if (raw) {
      const rawDoc = new DOMParser().parseFromString(raw, "text/html");
      const imgs = Array.from(rawDoc.body.querySelectorAll("img"));
      for (const img of imgs) {
        const src = String(img.getAttribute("src") ?? "").trim();
        if (!isSafeHttpUrl(src)) continue;
        out.push({ type: "image", data: { src, ratio: "auto" } });
      }
    }
  } catch {
    // ignore
  }

  // Convert structure from cleaned HTML.
  try {
    const doc = new DOMParser().parseFromString(cleaned || "", "text/html");

    const nodes: Node[] = [];
    flattenInterestingNodes(doc.body, nodes);

    for (const node of nodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        pushParagraphFromText(out, String(node.nodeValue ?? ""));
        continue;
      }

      const el = node as Element;
      const tag = el.tagName.toLowerCase();

      if (tag === "hr") {
        out.push({ type: "divider" });
        continue;
      }

      if (tag === "h2" || tag === "h3") {
        const text = String(el.textContent ?? "").trim();
        if (!text) continue;
        out.push({ type: "heading", data: { level: tag === "h3" ? 3 : 2 }, locale: { text, anchor: "" } });
        continue;
      }

      if (tag === "ul" || tag === "ol") {
        const li = Array.from(el.querySelectorAll(":scope > li"));
        const items = li
          .map((x) => String(x.textContent ?? "").trim())
          .filter(Boolean)
          .slice(0, 200);

        if (!items.length) continue;

        // If list contains inline markup (links/bold), fall back to rich_text to preserve it.
        const hasInline = li.some((x) => elementHasInlineMarkup(x));
        if (hasInline) {
          const html = sanitizeRichTextHtml(el.outerHTML);
          if (html) out.push({ type: "rich_text", locale: { html } });
          continue;
        }

        out.push(tag === "ol" ? { type: "numbered", locale: { items } } : { type: "bullets", locale: { items } });
        continue;
      }

      if (tag === "p") {
        const rawText = String(el.textContent ?? "").trim();
        if (!rawText) continue;

        if (isDividerText(rawText)) {
          out.push({ type: "divider" });
          continue;
        }

        // Preserve formatting (links/bold) via rich_text.
        if (elementHasInlineMarkup(el)) {
          const html = sanitizeRichTextHtml(el.outerHTML);
          if (html) out.push({ type: "rich_text", locale: { html } });
          continue;
        }

        pushParagraphFromText(out, rawText);
        continue;
      }

      if (tag === "img") {
        const src = String(el.getAttribute("src") ?? "").trim();
        if (!isSafeHttpUrl(src)) continue;
        out.push({ type: "image", data: { src, ratio: "auto" } });
        continue;
      }
    }

    const normalized = out.filter((b) => b.type !== "rich_text" || Boolean((b as any).locale?.html));
    if (normalized.length) return normalized;
  } catch {
    // ignore
  }

  return null;
}

function blocksFromPlainText(text: string): StandardCmsBlockSpec[] | null {
  const cleaned = cleanPastedText(text);
  if (!cleaned) return null;

  const out: StandardCmsBlockSpec[] = [];
  const lines = cleaned.split("\n");

  const flushParagraph = (buf: string[]) => {
    const t = buf.join("\n").trim();
    if (!t) return;
    pushParagraphFromText(out, t);
  };

  let paragraph: string[] = [];
  let listMode: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  const flushList = () => {
    if (!listMode || !listItems.length) {
      listMode = null;
      listItems = [];
      return;
    }
    out.push(listMode === "ol" ? { type: "numbered", locale: { items: listItems } } : { type: "bullets", locale: { items: listItems } });
    listMode = null;
    listItems = [];
  };

  for (const line of lines) {
    const l = line.trim();

    if (!l) {
      flushList();
      flushParagraph(paragraph);
      paragraph = [];
      continue;
    }

    // Headings markers (robust, not exhaustive)
    if (l.startsWith("## ")) {
      flushList();
      flushParagraph(paragraph);
      paragraph = [];
      out.push({ type: "heading", data: { level: 2 }, locale: { text: l.slice(3).trim(), anchor: "" } });
      continue;
    }

    if (l.startsWith("### ")) {
      flushList();
      flushParagraph(paragraph);
      paragraph = [];
      out.push({ type: "heading", data: { level: 3 }, locale: { text: l.slice(4).trim(), anchor: "" } });
      continue;
    }

    // Divider
    if (isDividerText(l)) {
      flushList();
      flushParagraph(paragraph);
      paragraph = [];
      out.push({ type: "divider" });
      continue;
    }

    // Lists
    const ulMatch = /^[-•*]\s+(.+)$/.exec(l);
    const olMatch = /^\d+[.)]\s+(.+)$/.exec(l);

    if (ulMatch) {
      flushParagraph(paragraph);
      paragraph = [];
      if (listMode && listMode !== "ul") flushList();
      listMode = "ul";
      listItems.push(ulMatch[1].trim());
      continue;
    }

    if (olMatch) {
      flushParagraph(paragraph);
      paragraph = [];
      if (listMode && listMode !== "ol") flushList();
      listMode = "ol";
      listItems.push(olMatch[1].trim());
      continue;
    }

    // Default: paragraph
    paragraph.push(line);
  }

  flushList();
  flushParagraph(paragraph);

  return out.length ? out : null;
}

/**
 * Clean-copy V2:
 * Convert clipboard content into standard CMS blocks when it's safe and predictable.
 * Falls back to V1 behavior when it can't produce a clean block list.
 */
export function clipboardToStandardCmsBlocks(args: { html?: string; text?: string }): StandardCmsBlockSpec[] | null {
  const cleaned = cleanClipboardToRichTextHtml(args);
  const fromHtml = blocksFromCleanHtml(cleaned.html, String(args.html ?? ""));
  if (fromHtml && fromHtml.length) return fromHtml;

  const fromText = blocksFromPlainText(cleaned.text);
  if (fromText && fromText.length) return fromText;

  return null;
}
