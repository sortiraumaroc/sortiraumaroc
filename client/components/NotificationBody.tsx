import { Fragment } from "react";

import { cn } from "@/lib/utils";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

const ISO_DATE_TIME_RE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\b/;
const FORMATTED_FR_DATE_TIME_RE = /^le \d{2}\/\d{2}\/\d{2}(?: à \d{2}h\d{2})?$/;

function formatIsoWithinText(raw: string): string {
  const match = raw.match(ISO_DATE_TIME_RE);
  if (!match) return raw;
  const formatted = formatLeJjMmAaAHeure(match[0]);
  return raw === match[0] ? formatted : raw.replace(match[0], formatted);
}

function isDateTimeSegment(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  if (FORMATTED_FR_DATE_TIME_RE.test(text)) return true;
  if (ISO_DATE_TIME_RE.test(text)) return true;

  // Some older payloads can include a formatted date inside a bigger segment.
  if (text.includes("/")) {
    const normalized = formatIsoWithinText(text);
    if (FORMATTED_FR_DATE_TIME_RE.test(normalized.trim())) return true;
  }

  return false;
}

function renderLine(line: string, dateClassName?: string) {
  const chunks = line.split(" · ");
  if (chunks.length <= 1) {
    const normalized = formatIsoWithinText(line);
    if (!ISO_DATE_TIME_RE.test(line)) return <span className="min-w-0">{normalized}</span>;

    const match = normalized.match(/le \d{2}\/\d{2}\/\d{2}(?: à \d{2}h\d{2})?/);
    if (!match) return <span className="min-w-0">{normalized}</span>;

    const before = normalized.slice(0, match.index ?? 0);
    const date = match[0];
    const after = normalized.slice((match.index ?? 0) + date.length);

    return (
      <span className="min-w-0">
        {before}
        <span
          className={cn(
            "inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 tabular-nums",
            dateClassName,
          )}
        >
          {date}
        </span>
        {after}
      </span>
    );
  }

  return chunks.map((chunk, idx) => {
    const normalized = formatIsoWithinText(chunk);
    const isDate = isDateTimeSegment(chunk) || isDateTimeSegment(normalized);

    return (
      <Fragment key={`${idx}-${chunk}`}>
        {idx > 0 ? <span className="text-slate-300" aria-hidden="true">•</span> : null}
        {isDate ? (
          <span
            className={cn(
              "inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 tabular-nums",
              dateClassName,
            )}
          >
            {normalized.trim()}
          </span>
        ) : (
          <span className="min-w-0">{normalized}</span>
        )}
      </Fragment>
    );
  });
}

export function NotificationBody(props: {
  body?: string | null;
  className?: string;
  dateClassName?: string;
}) {
  const body = String(props.body ?? "");
  if (!body.trim()) return null;

  const lines = body.split(/\r?\n/);

  return (
    <div className={cn("space-y-1", props.className)}>
      {lines.map((line, idx) => (
        <div key={`${idx}-${line}`} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
          {renderLine(line, props.dateClassName)}
        </div>
      ))}
    </div>
  );
}
