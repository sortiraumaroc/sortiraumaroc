"use client";

import React from "react";
import { FileText } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { WizardData } from "../wizardConstants";

type Props = {
  data: WizardData;
  onChange: (updates: Partial<WizardData>) => void;
};

/**
 * Strip HTML tags, collapse whitespace, and keep only plain text from pasted content.
 */
function stripToPlainText(html: string): string {
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, " ");
  // Decode common HTML entities
  text = text.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
  // Collapse multiple spaces / newlines into single space
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function handlePastePlainText(
  e: React.ClipboardEvent<HTMLTextAreaElement>,
  field: keyof WizardData,
  maxLength: number,
  onChange: (updates: Partial<WizardData>) => void,
) {
  const html = e.clipboardData.getData("text/html");
  const raw = e.clipboardData.getData("text/plain");
  // If there's HTML content, clean it; otherwise use raw text as-is
  const clean = html ? stripToPlainText(html) : raw;
  if (clean !== raw) {
    e.preventDefault();
    const target = e.currentTarget;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    const current = target.value;
    const newValue = (current.slice(0, start) + clean + current.slice(end)).slice(0, maxLength);
    onChange({ [field]: newValue } as Partial<WizardData>);
  }
}

export default function WizardStepDescriptions({ data, onChange }: Props) {
  const shortDescLength = (data.short_description ?? "").length;
  const longDescLength = (data.long_description ?? "").length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Descriptions de l&rsquo;&eacute;tablissement
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          R&eacute;digez une description SEO courte et une description
          d&eacute;taill&eacute;e
        </p>
      </div>

      {/* Description courte (SEO) */}
      <div className="space-y-2">
        <Label
          htmlFor="short_description"
          className="flex items-center gap-2 text-sm font-medium text-slate-700"
        >
          <FileText className="h-4 w-4 text-slate-500" />
          Description courte (SEO) <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="short_description"
          value={data.short_description}
          onChange={(e) => onChange({ short_description: e.target.value })}
          onPaste={(e) => handlePastePlainText(e, "short_description", 200, onChange)}
          placeholder="Br&egrave;ve description de votre &eacute;tablissement pour les moteurs de recherche..."
          rows={3}
          maxLength={200}
          className="rounded-lg resize-none"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Appara&icirc;tra dans les r&eacute;sultats de recherche. Soyez
            concis et impactant.
          </p>
          <span
            className={`text-xs font-medium ${
              shortDescLength > 160 ? "text-red-500" : "text-slate-400"
            }`}
          >
            {shortDescLength}/160
          </span>
        </div>
      </div>

      {/* Description longue */}
      <div className="space-y-2">
        <Label
          htmlFor="long_description"
          className="flex items-center gap-2 text-sm font-medium text-slate-700"
        >
          <FileText className="h-4 w-4 text-slate-500" />
          Description longue
        </Label>
        <Textarea
          id="long_description"
          value={data.long_description}
          onChange={(e) => onChange({ long_description: e.target.value })}
          onPaste={(e) => handlePastePlainText(e, "long_description", 750, onChange)}
          placeholder="Description compl&egrave;te de votre &eacute;tablissement, ses services, son ambiance..."
          rows={8}
          maxLength={750}
          className="rounded-lg resize-none"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Description compl&egrave;te visible sur la page de
            l&rsquo;&eacute;tablissement.
          </p>
          <span
            className={`text-xs font-medium ${
              longDescLength > 750 ? "text-red-500" : "text-slate-400"
            }`}
          >
            {longDescLength}/750
          </span>
        </div>
      </div>
    </div>
  );
}
