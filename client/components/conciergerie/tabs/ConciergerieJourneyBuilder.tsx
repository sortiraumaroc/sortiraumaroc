import { useCallback, useState } from "react";
import {
  PlusCircle,
  Trash2,
  Search,
  Loader2,
  Send,
  CheckCircle2,
  X,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  ConciergeProfile,
  CreateJourneyPayload,
  CreateStepPayload,
} from "@shared/conciergerieTypes";
import {
  createJourney,
  sendStepRequests,
  sendJourneyRequests,
  searchEstablishments,
  type EstablishmentSearchResult,
} from "@/lib/conciergerie/api";

type Props = {
  concierge: ConciergeProfile;
  onCreated: (journeyId: string) => void;
};

const UNIVERSES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "loisir", label: "Loisir" },
  { value: "hebergement", label: "Hébergement" },
  { value: "sport", label: "Sport" },
  { value: "culture", label: "Culture" },
  { value: "wellness", label: "Bien-être" },
] as const;

type StepDraft = CreateStepPayload & {
  _key: string;
  selectedEstablishments: EstablishmentSearchResult[];
  message: string;
};

function newStepDraft(order: number): StepDraft {
  return {
    _key: Math.random().toString(36).slice(2, 9),
    step_order: order,
    universe: undefined,
    category: "",
    description: "",
    budget_min: undefined,
    budget_max: undefined,
    selectedEstablishments: [],
    message: "",
  };
}

export default function ConciergerieJourneyBuilder({
  concierge,
  onCreated,
}: Props) {
  // Client info
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [title, setTitle] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [desiredTimeStart, setDesiredTimeStart] = useState("");
  const [desiredTimeEnd, setDesiredTimeEnd] = useState("");
  const [city, setCity] = useState("");

  // Steps
  const [steps, setSteps] = useState<StepDraft[]>([newStepDraft(1)]);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<EstablishmentSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeSearchStepKey, setActiveSearchStepKey] = useState<string | null>(null);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const addStep = () => {
    setSteps((prev) => [...prev, newStepDraft(prev.length + 1)]);
  };

  const removeStep = (key: string) => {
    setSteps((prev) => {
      const filtered = prev.filter((s) => s._key !== key);
      return filtered.map((s, i) => ({ ...s, step_order: i + 1 }));
    });
  };

  const updateStep = (key: string, patch: Partial<StepDraft>) => {
    setSteps((prev) =>
      prev.map((s) => (s._key === key ? { ...s, ...patch } : s)),
    );
  };

  const handleSearch = useCallback(
    async (stepKey: string) => {
      setActiveSearchStepKey(stepKey);
      setSearchLoading(true);
      setSearchResults([]);

      const step = steps.find((s) => s._key === stepKey);

      try {
        const { results } = await searchEstablishments({
          q: searchQuery || undefined,
          city: city || undefined,
          universe: step?.universe || undefined,
          limit: 15,
        });
        setSearchResults(results);
      } catch (e) {
        console.error("[conciergerie] search error:", e);
      }
      setSearchLoading(false);
    },
    [searchQuery, city, steps],
  );

  const selectEstablishment = (stepKey: string, est: EstablishmentSearchResult) => {
    updateStep(stepKey, {
      selectedEstablishments: [
        ...(steps.find((s) => s._key === stepKey)?.selectedEstablishments ?? []),
        est,
      ].slice(0, 5),
    });
    setSearchResults([]);
    setActiveSearchStepKey(null);
    setSearchQuery("");
  };

  const removeEstablishment = (stepKey: string, estId: string) => {
    const step = steps.find((s) => s._key === stepKey);
    if (!step) return;
    updateStep(stepKey, {
      selectedEstablishments: step.selectedEstablishments.filter(
        (e) => e.id !== estId,
      ),
    });
  };

  const handleSubmit = async () => {
    setError(null);

    // Validation
    if (!clientName.trim()) {
      setError("Le nom du client est requis.");
      return;
    }
    if (!desiredDate) {
      setError("La date souhaitée est requise.");
      return;
    }
    if (partySize < 1) {
      setError("Le nombre de personnes doit être >= 1.");
      return;
    }
    if (steps.length === 0) {
      setError("Au moins une étape est requise.");
      return;
    }

    // Check each step has at least one establishment
    for (const step of steps) {
      if (step.selectedEstablishments.length === 0) {
        setError(
          `L'étape ${step.step_order} n'a pas d'établissement sélectionné.`,
        );
        return;
      }
    }

    setSubmitting(true);

    try {
      // 1. Create journey
      const payload: CreateJourneyPayload = {
        client_name: clientName.trim(),
        client_phone: clientPhone.trim() || undefined,
        client_email: clientEmail.trim() || undefined,
        client_notes: clientNotes.trim() || undefined,
        party_size: partySize,
        title: title.trim() || undefined,
        desired_date: desiredDate,
        desired_time_start: desiredTimeStart || undefined,
        desired_time_end: desiredTimeEnd || undefined,
        city: city.trim() || undefined,
        steps: steps.map((s) => ({
          step_order: s.step_order,
          universe: s.universe,
          category: s.category || undefined,
          description: s.description || undefined,
          budget_min: s.budget_min,
          budget_max: s.budget_max,
        })),
      };

      const created = await createJourney(payload);

      // 2. Send step requests for each step
      for (const [i, step] of steps.entries()) {
        const createdStep = created.steps[i];
        if (!createdStep) continue;

        await sendStepRequests(createdStep.id, {
          establishment_ids: step.selectedEstablishments.map((e) => e.id),
          message: step.message || undefined,
        });
      }

      // 3. Send the journey (transitions to "requesting" + sends emails)
      await sendJourneyRequests(created.id);

      setSuccess(true);
      setTimeout(() => onCreated(created.id), 1500);
    } catch (e: any) {
      setError(e.message ?? "Erreur lors de la création");
    }
    setSubmitting(false);
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <CheckCircle2 className="w-16 h-16 text-green-500" />
        <h2 className="text-xl font-bold">Parcours créé et envoyé !</h2>
        <p className="text-slate-500">
          Les demandes ont été envoyées aux établissements.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Nouveau parcours</h2>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* Client info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informations client</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nom du client *</Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Jean Dupont"
              />
            </div>
            <div className="space-y-2">
              <Label>Nombre de personnes *</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={partySize}
                onChange={(e) => setPartySize(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="+212 6..."
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="client@email.com"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={clientNotes}
              onChange={(e) => setClientNotes(e.target.value)}
              placeholder="Allergies, préférences, occasion spéciale..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Journey info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Détails du parcours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Titre (optionnel)</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Soirée romantique, Teambuilding..."
              />
            </div>
            <div className="space-y-2">
              <Label>Ville</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Marrakech, Casablanca..."
              />
            </div>
            <div className="space-y-2">
              <Label>Date souhaitée *</Label>
              <Input
                type="date"
                value={desiredDate}
                onChange={(e) => setDesiredDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Heure début</Label>
                <Input
                  type="time"
                  value={desiredTimeStart}
                  onChange={(e) => setDesiredTimeStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Heure fin</Label>
                <Input
                  type="time"
                  value={desiredTimeEnd}
                  onChange={(e) => setDesiredTimeEnd(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Steps */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Étapes ({steps.length})</h3>
          <Button variant="outline" size="sm" onClick={addStep}>
            <PlusCircle className="w-4 h-4 mr-1" /> Ajouter une étape
          </Button>
        </div>

        {steps.map((step) => (
          <Card key={step._key}>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">
                  Étape {step.step_order}
                </h4>
                {steps.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeStep(step._key)}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Univers</Label>
                  <select
                    value={step.universe ?? ""}
                    onChange={(e) =>
                      updateStep(step._key, {
                        universe: (e.target.value || undefined) as any,
                      })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Tous</option>
                    {UNIVERSES.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Catégorie</Label>
                  <Input
                    value={step.category ?? ""}
                    onChange={(e) =>
                      updateStep(step._key, { category: e.target.value })
                    }
                    placeholder="Gastronomique, Spa..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>Budget min (MAD)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={step.budget_min ?? ""}
                      onChange={(e) =>
                        updateStep(step._key, {
                          budget_min: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Budget max (MAD)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={step.budget_max ?? ""}
                      onChange={(e) =>
                        updateStep(step._key, {
                          budget_max: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description de la demande</Label>
                <Textarea
                  value={step.description ?? ""}
                  onChange={(e) =>
                    updateStep(step._key, { description: e.target.value })
                  }
                  placeholder="Décrivez ce que vous recherchez..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Message personnalisé (optionnel)</Label>
                <Input
                  value={step.message}
                  onChange={(e) =>
                    updateStep(step._key, { message: e.target.value })
                  }
                  placeholder="Message supplémentaire pour les établissements..."
                />
              </div>

              {/* Establishment selection */}
              <div className="space-y-2">
                <Label>
                  Établissements ({step.selectedEstablishments.length}/5)
                </Label>

                {/* Selected establishments */}
                {step.selectedEstablishments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {step.selectedEstablishments.map((est) => (
                      <div
                        key={est.id}
                        className="flex items-center gap-1 bg-primary/10 text-primary text-sm px-2 py-1 rounded-full"
                      >
                        <span className="truncate max-w-[150px]">
                          {est.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeEstablishment(step._key, est.id)}
                          className="hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Search */}
                {step.selectedEstablishments.length < 5 && (
                  <div className="flex gap-2">
                    <Input
                      value={
                        activeSearchStepKey === step._key ? searchQuery : ""
                      }
                      onChange={(e) => {
                        setActiveSearchStepKey(step._key);
                        setSearchQuery(e.target.value);
                      }}
                      onFocus={() => setActiveSearchStepKey(step._key)}
                      placeholder="Rechercher un établissement..."
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSearch(step._key)}
                      disabled={searchLoading && activeSearchStepKey === step._key}
                    >
                      {searchLoading && activeSearchStepKey === step._key ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                )}

                {/* Search results */}
                {activeSearchStepKey === step._key &&
                  searchResults.length > 0 && (
                    <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
                      {searchResults
                        .filter(
                          (r) =>
                            !step.selectedEstablishments.some(
                              (s) => s.id === r.id,
                            ),
                        )
                        .map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => selectEstablishment(step._key, r)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-3"
                          >
                            {r.cover_url ? (
                              <img
                                src={r.cover_url}
                                alt=""
                                className="w-8 h-8 rounded object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded bg-slate-100 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium truncate">{r.name}</p>
                              <p className="text-xs text-slate-500">
                                {[r.city, r.universe, r.category]
                                  .filter(Boolean)
                                  .join(" · ")}
                                {r.rating ? ` · ⭐ ${r.rating.toFixed(1)}` : ""}
                              </p>
                            </div>
                          </button>
                        ))}
                    </div>
                  )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 pb-10">
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          size="lg"
          className="min-w-[200px]"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          Créer et envoyer les demandes
        </Button>
      </div>
    </div>
  );
}
