import { useEffect, useMemo, useRef, useState } from "react";
import { Bold, Bot, Italic, Link2, List, ListOrdered, Minus, TextCursorInput, Underline } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { cleanClipboardToRichTextHtml, sanitizeRichTextHtml } from "@/lib/richText";
import { AIAssistantDialog } from "./AIAssistantDialog";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
  disabled?: boolean;

  /**
   * Optional hook to intercept a paste event.
   * Return true when you fully handled the paste (RichTextEditor will not insert anything).
   */
  onPasteCleanCopy?: (payload: { html: string; text: string; cleanedHtml: string; cleanedText: string }) => boolean;
};

function exec(command: string, value?: string) {
  try {
    // eslint-disable-next-line deprecation/deprecation
    document.execCommand(command, false, value);
  } catch {
    // ignore
  }
}

function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (v.startsWith("/") || v.startsWith("#") || v.startsWith("mailto:") || v.startsWith("tel:")) return v;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  return `https://${v}`;
}

export function RichTextEditor({ value, onChange, placeholder, className, editorClassName, disabled, onPasteCleanCopy }: Props) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastValueRef = useRef<string>(value);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const [aiOpen, setAiOpen] = useState(false);

  const toolbar = useMemo(
    () => [
      {
        key: "h2",
        icon: TextCursorInput,
        label: t("admin.richtext.h2"),
        onClick: () => exec("formatBlock", "h2"),
      },
      {
        key: "h3",
        icon: TextCursorInput,
        label: t("admin.richtext.h3"),
        onClick: () => exec("formatBlock", "h3"),
      },
      {
        key: "p",
        icon: Minus,
        label: t("admin.richtext.p"),
        onClick: () => exec("formatBlock", "p"),
      },
      {
        key: "bold",
        icon: Bold,
        label: t("admin.richtext.bold"),
        onClick: () => exec("bold"),
      },
      {
        key: "italic",
        icon: Italic,
        label: t("admin.richtext.italic"),
        onClick: () => exec("italic"),
      },
      {
        key: "underline",
        icon: Underline,
        label: t("admin.richtext.underline"),
        onClick: () => exec("underline"),
      },
      {
        key: "ul",
        icon: List,
        label: t("admin.richtext.ul"),
        onClick: () => exec("insertUnorderedList"),
      },
      {
        key: "ol",
        icon: ListOrdered,
        label: t("admin.richtext.ol"),
        onClick: () => exec("insertOrderedList"),
      },
      {
        key: "link",
        icon: Link2,
        label: t("admin.richtext.link"),
        onClick: () => setLinkOpen(true),
      },
      {
        key: "ai",
        icon: Bot,
        label: t("admin.richtext.ai"),
        onClick: () => setAiOpen(true),
      },
    ],
    [t],
  );

  const handleAIInsert = (text: string) => {
    const root = rootRef.current;
    if (!root) return;

    // Insert the AI-generated text at the current cursor position or at the end
    root.focus();
    exec("insertHTML", `<p>${text.replace(/\n/g, "</p><p>")}</p>`);
    emitChange();
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (value !== lastValueRef.current) {
      // Avoid cursor jumps while typing. Only sync when the change comes from outside.
      root.innerHTML = value || "";
      lastValueRef.current = value;
    }
  }, [value]);

  const emitChange = () => {
    const root = rootRef.current;
    if (!root) return;
    const html = sanitizeRichTextHtml(root.innerHTML);
    lastValueRef.current = html;
    onChange(html);
  };

  const insertLink = () => {
    const url = normalizeUrl(linkHref);
    setLinkOpen(false);
    setLinkHref("");
    if (!url) return;

    exec("createLink", url);
    // Ensure external links open in a new tab for safety.
    const root = rootRef.current;
    if (!root) return;

    const anchors = Array.from(root.querySelectorAll("a"));
    for (const a of anchors) {
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("http://") || href.startsWith("https://")) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      }
    }

    emitChange();
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {toolbar.map((item) => (
          <Button
            key={item.key}
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={disabled}
            onMouseDown={(e) => {
              // Prevent losing selection.
              e.preventDefault();
            }}
            onClick={(e) => {
              e.preventDefault();
              item.onClick();
              if (item.key !== "link") emitChange();
            }}
          >
            <item.icon className="h-4 w-4" />
            <span className="text-xs font-semibold">{item.label}</span>
          </Button>
        ))}
      </div>

      <div
        ref={rootRef}
        role="textbox"
        aria-multiline="true"
        className={cn(
          "min-h-[260px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          disabled ? "opacity-70 pointer-events-none" : "",
          editorClassName,
        )}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder ?? ""}
        onInput={emitChange}
        onBlur={emitChange}
        onPaste={(e) => {
          // Clean-copy V1/V2:
          // - remove inline styles/garbage
          // - keep basic structure when possible (p/h2/h3/lists/links)
          // - guarantee a clean text fallback
          // - allow parent to intercept and convert to blocks
          e.preventDefault();

          const html = e.clipboardData.getData("text/html");
          const text = e.clipboardData.getData("text/plain");

          const cleaned = cleanClipboardToRichTextHtml({ html, text });

          if (onPasteCleanCopy?.({ html, text, cleanedHtml: cleaned.html, cleanedText: cleaned.text })) {
            return;
          }

          if (cleaned.html) {
            exec("insertHTML", cleaned.html);
          } else {
            exec("insertText", cleaned.text);
          }

          emitChange();
        }}
      />

      <style>
        {`
          [data-placeholder]:empty:before {
            content: attr(data-placeholder);
            color: rgb(100 116 139);
          }
        `}
      </style>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.richtext.link.dialog_title")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm text-slate-600">{t("admin.richtext.link.hint")}</div>
            <Input
              value={linkHref}
              onChange={(e) => setLinkHref(e.target.value)}
              placeholder={t("admin.richtext.link.placeholder")}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="button" onClick={insertLink} disabled={!linkHref.trim()}>
                {t("admin.richtext.link.insert")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AIAssistantDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        onInsert={handleAIInsert}
      />
    </div>
  );
}
