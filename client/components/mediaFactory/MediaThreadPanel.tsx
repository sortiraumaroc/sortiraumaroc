import { useMemo, useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTimeShort } from "./mediaFactoryStatus";

type ThreadMessage = {
  id: string;
  created_at: string;
  from_role?: string | null;
  author_user_id?: string | null;
  body?: string | null;
};

function roleLabel(role: string | null | undefined): string {
  const s = (role ?? "").trim().toLowerCase();
  if (s === "pro") return "Pro";
  if (s === "partner") return "PARTNER";
  if (s === "admin") return "RC";
  return role?.toUpperCase() ?? "—";
}

export function MediaThreadPanel(props: {
  title?: string;
  messages: ThreadMessage[];
}) {
  const [draft, setDraft] = useState("");

  const sorted = useMemo(() => {
    return [...(props.messages ?? [])].sort((a, b) =>
      (a.created_at ?? "").localeCompare(b.created_at ?? ""),
    );
  }, [props.messages]);

  return (
    <Card className="border-slate-200">
      <CardHeader className="py-3">
        <CardTitle className="text-sm">
          {props.title ?? "Fil de discussion"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <div className="max-h-[320px] overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 space-y-2">
          {sorted.length ? (
            sorted.map((m) => (
              <div
                key={m.id}
                className="rounded-md bg-white border border-slate-200 px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold text-slate-700">
                    {roleLabel(m.from_role)}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {formatDateTimeShort(m.created_at)}
                  </div>
                </div>
                <div className="text-sm text-slate-900 whitespace-pre-wrap">
                  {(m.body ?? "").trim() || "(message vide)"}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-600 py-8 text-center">
              Aucun message.
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Envoyer un message (bientôt)…"
            disabled
            className="h-9"
          />
          <Button size="sm" disabled className="gap-2">
            <Send className="h-4 w-4" />
            Envoyer
          </Button>
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          Chat en lecture seule pour l’instant (UI scaffolding). L’envoi sera
          activé dans l’étape “workflow guards & actions”.
        </div>
      </CardContent>
    </Card>
  );
}
