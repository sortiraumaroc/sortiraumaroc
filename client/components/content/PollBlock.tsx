import { useEffect, useMemo, useState } from "react";

import { AuthModalV2 } from "@/components/AuthModalV2";
import { Button } from "@/components/ui/button";
import { isAuthed } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getPublicBlogPollResults, votePublicBlogPoll, type BlogPollResults } from "@/lib/blogPolls";

type Props = {
  slug: string;
  pollId: string;
  question: string;
  options: string[];
};

export function PollBlock({ slug, pollId, question, options }: Props) {
  const { locale } = useI18n();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [results, setResults] = useState<BlogPollResults | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authedFlag, setAuthedFlag] = useState(() => isAuthed());

  const reload = async (cancelledRef?: { cancelled: boolean }) => {
    if (!slug || !pollId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const r = await getPublicBlogPollResults({ slug, pollId, locale });
      if (!cancelledRef?.cancelled) {
        setResults(r);
        if (typeof r.my_vote === "number") setSelected(r.my_vote);
      }
    } catch (e) {
      if (!cancelledRef?.cancelled) setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      if (!cancelledRef?.cancelled) setLoading(false);
    }
  };

  useEffect(() => {
    const cancelledRef = { cancelled: false };

    void reload(cancelledRef);

    return () => {
      cancelledRef.cancelled = true;
    };
  }, [slug, pollId, locale]);

  useEffect(() => {
    const onChanged = () => setAuthedFlag(isAuthed());
    window.addEventListener("sam-auth-changed", onChanged);
    return () => window.removeEventListener("sam-auth-changed", onChanged);
  }, []);

  const requireAuth = () => {
    setAuthOpen(true);
  };

  useEffect(() => {
    if (!authOpen && authedFlag) {
      void reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authOpen, authedFlag]);


  const countsByIndex = useMemo(() => {
    const map = new Map<number, { count: number; percent: number }>();
    for (const c of results?.counts ?? []) {
      if (!c || typeof c !== "object") continue;
      const idx = (c as any).option_index;
      const count = (c as any).count;
      const percent = (c as any).percent;
      if (typeof idx === "number" && Number.isFinite(idx) && typeof count === "number" && Number.isFinite(count)) {
        map.set(Math.max(0, Math.floor(idx)), {
          count: Math.max(0, Math.floor(count)),
          percent: typeof percent === "number" && Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 0,
        });
      }
    }
    return map;
  }, [results]);

  const hasVoted = typeof results?.my_vote === "number";

  const strings = {
    title: locale === "en" ? "Poll" : "Sondage",
    vote: locale === "en" ? "Vote" : "Voter",
    votes: locale === "en" ? "votes" : "votes",
    loading: locale === "en" ? "Loading…" : "Chargement…",
    choose: locale === "en" ? "Choose an answer" : "Choisissez une réponse",
    thanks: locale === "en" ? "Thanks for voting" : "Merci pour votre vote",
    loginToVote: locale === "en" ? "Log in to vote" : "Connecte-toi pour voter",
  };

  if (!pollId || !question || !options.length) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <AuthModalV2
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthed={() => {
          setAuthOpen(false);
          setAuthedFlag(true);
          void reload();
        }}
        contextTitle={locale === "en" ? "Log in to vote" : "Connecte-toi pour voter"}
        contextSubtitle={locale === "en" ? "This poll is reserved to connected users." : "Ce sondage est réservé aux utilisateurs connectés."}
      />
      <div className="text-xs font-semibold text-slate-500">{strings.title}</div>
      <div className="mt-1 text-base font-extrabold text-foreground">{question}</div>

      {loading ? <div className="mt-3 text-sm text-slate-600">{strings.loading}</div> : null}
      {error ? <div className="mt-3 text-sm text-red-700">{error}</div> : null}

      {!loading && !hasVoted ? (
        <div className="mt-4 space-y-3">
          {!authedFlag ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm text-slate-700">{strings.loginToVote}</div>
              <div className="mt-3">
                <Button type="button" className="font-semibold" onClick={requireAuth}>
                  {strings.loginToVote}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-sm text-slate-600">{strings.choose}</div>

          <div className="space-y-2">
            {options.map((opt, idx) => (
              <label
                key={`${pollId}-${idx}`}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2",
                  selected === idx ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:bg-slate-50",
                )}
              >
                <input
                  type="radio"
                  name={`poll-${pollId}`}
                  checked={selected === idx}
                  onChange={() => setSelected(idx)}
                  className="mt-1"
                />
                <span className="text-sm text-slate-800">{opt}</span>
              </label>
            ))}
          </div>

              <div>
                <Button
                  type="button"
                  className="font-semibold"
                  disabled={selected === null}
                  onClick={async () => {
                    if (selected === null) return;

                    setError(null);
                    try {
                      const next = await votePublicBlogPoll({ slug, pollId, optionIndex: selected });
                      setResults(next);
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e ?? "Erreur");
                      if (msg.includes("401") || msg.toLowerCase().includes("unauthorized")) {
                        requireAuth();
                        return;
                      }
                      setError(msg);
                    }
                  }}
                >
                  {strings.vote}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {!loading && results ? (
        <div className="mt-4">
          <div className="text-sm text-slate-700">
            {hasVoted ? strings.thanks : ""} {results.total_votes} {strings.votes}
          </div>

          <div className="mt-3 space-y-2">
            {options.map((opt, idx) => {
              const stats = countsByIndex.get(idx) ?? { count: 0, percent: 0 };
              const isMine = results.my_vote === idx;

              return (
                <div key={`${pollId}-result-${idx}`} className={cn("rounded-md border border-slate-200 bg-slate-50 p-3", isMine ? "ring-1 ring-primary" : "")}> 
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-800">{opt}</div>
                    <div className="text-xs text-slate-600">
                      {stats.percent}% · {stats.count}
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${stats.percent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
