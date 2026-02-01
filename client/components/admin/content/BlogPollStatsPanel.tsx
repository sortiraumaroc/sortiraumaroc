import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getAdminCmsBlogPollStats, type BlogPollStatsAdmin } from "@/lib/adminApi";

type Props = {
  articleId: string;
};

export function BlogPollStatsPanel({ articleId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<BlogPollStatsAdmin[]>([]);

  const load = async () => {
    if (!articleId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await getAdminCmsBlogPollStats(undefined, articleId);
      setItems(Array.isArray(res.items) ? res.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  const visible = useMemo(() => items.filter((p) => p && typeof p.poll_id === "string" && p.poll_id.trim()), [items]);

  if (!articleId) return null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Stats sondages</CardTitle>
        <Button type="button" variant="outline" onClick={load} disabled={loading}>
          {loading ? "Chargement…" : "Rafraîchir"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <div className="text-sm text-red-700">{error}</div> : null}

        {!loading && !visible.length ? (
          <div className="text-sm text-slate-600">Aucun sondage (ou aucun vote) pour cet article.</div>
        ) : null}

        {visible.map((poll) => {
          const question = poll.question_fr || poll.question_en || "";
          const options = poll.options_fr?.length ? poll.options_fr : poll.options_en ?? [];

          return (
            <div key={poll.poll_id} className="rounded-lg border border-slate-200 p-4">
              <div className="text-xs font-semibold text-slate-500">{poll.poll_id}</div>
              {question ? <div className="mt-1 text-sm font-extrabold text-foreground">{question}</div> : null}
              {poll.total_votes !== undefined ? (
                <div className="mt-1 text-xs text-slate-600">
                  Total votes: {poll.total_votes}
                  {typeof poll.total_votes_auth === "number" && typeof poll.total_votes_legacy === "number" ? (
                    <>
                      {" "}· auth: {poll.total_votes_auth} · legacy: {poll.total_votes_legacy}
                    </>
                  ) : null}
                </div>
              ) : null}

              {options.length ? (
                <div className="mt-3 space-y-2">
                  {options.map((opt, idx) => {
                    const row = Array.isArray(poll.counts) ? poll.counts.find((c) => c.option_index === idx) : null;
                    const count = row ? row.count : 0;
                    const percent = row ? row.percent : 0;
                    return (
                      <div key={`${poll.poll_id}-${idx}`} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-semibold text-slate-800">{opt}</div>
                          <div className="text-xs text-slate-600">
                            {percent}% · {count}
                          </div>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
                          <div className={cn("h-2 rounded-full bg-primary")} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 text-sm text-slate-600">Réponses non configurées.</div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
