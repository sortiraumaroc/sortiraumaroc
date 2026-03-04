/**
 * Quote Request Form — Group Booking (> 15 persons)
 *
 * Triggered when user tries to book for > 15 people.
 * Captures event details and sends a quote request to the establishment.
 */

import * as React from "react";
import { useState, useCallback } from "react";
import {
  Users, CalendarDays, Clock, FileText,
  CheckCircle2, Loader2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useQuotesV2 } from "@/hooks/useReservationV2";
import type { EventType } from "../../../shared/reservationTypesV2";

export interface QuoteRequestFormProps {
  establishmentId: string;
  establishmentName: string;
  initialPartySize?: number;
  className?: string;
  onSubmitted?: (quoteId: string) => void;
}

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  birthday: "Anniversaire",
  wedding: "Mariage",
  seminar: "Séminaire",
  team_building: "Team building",
  business_meal: "Repas d'affaires",
  other: "Autre",
};

export function QuoteRequestForm({
  establishmentId,
  establishmentName,
  initialPartySize = 16,
  className,
  onSubmitted,
}: QuoteRequestFormProps) {
  const { submitQuote, loading, error } = useQuotesV2();
  const [submitted, setSubmitted] = useState(false);
  const [quoteId, setQuoteId] = useState<string | null>(null);

  // Form state
  const [partySize, setPartySize] = useState(initialPartySize);
  const [eventType, setEventType] = useState<EventType>("other");
  const [eventTypeOther, setEventTypeOther] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTimeSlot, setPreferredTimeSlot] = useState("");
  const [isDateFlexible, setIsDateFlexible] = useState(false);
  const [requirements, setRequirements] = useState("");
  const [budgetIndication, setBudgetIndication] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const handleSubmit = useCallback(async () => {
    const result = await submitQuote({
      establishment_id: establishmentId,
      party_size: partySize,
      event_type: eventType,
      event_type_other: eventType === "other" ? eventTypeOther : undefined,
      preferred_date: preferredDate || undefined,
      preferred_time_slot: preferredTimeSlot || undefined,
      is_date_flexible: isDateFlexible,
      requirements: requirements || undefined,
      budget_indication: budgetIndication || undefined,
      contact_phone: contactPhone || undefined,
      contact_email: contactEmail || undefined,
    });
    if (result) {
      setSubmitted(true);
      setQuoteId(result.quoteId);
      onSubmitted?.(result.quoteId);
    }
  }, [
    submitQuote, establishmentId, partySize, eventType, eventTypeOther,
    preferredDate, preferredTimeSlot, isDateFlexible, requirements,
    budgetIndication, contactPhone, contactEmail, onSubmitted,
  ]);

  // Success state
  if (submitted) {
    return (
      <div className={cn("space-y-6 text-center", className)}>
        <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <div>
          <h3 className="text-xl font-bold">Demande envoyée !</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Votre demande de devis a été transmise à <span className="font-medium">{establishmentName}</span>.
            Vous recevrez une notification dès que l'établissement aura répondu.
          </p>
        </div>
        {quoteId && (
          <Badge variant="outline" className="text-xs font-mono">
            Réf: {quoteId.slice(0, 8)}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      <div>
        <h3 className="text-lg font-semibold">Demande de devis</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Pour les groupes de plus de 15 personnes, l'établissement vous enverra un devis personnalisé.
        </p>
      </div>

      {/* Party size */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Users className="h-4 w-4" /> Nombre de personnes
        </Label>
        <Input
          type="number"
          min={16}
          value={partySize}
          onChange={(e) => setPartySize(Math.max(16, parseInt(e.target.value) || 16))}
          className="w-32"
        />
      </div>

      {/* Event type */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4" /> Type d'événement
        </Label>
        <Select value={eventType} onValueChange={(v) => setEventType(v as EventType)}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(EVENT_TYPE_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {eventType === "other" && (
          <Input
            value={eventTypeOther}
            onChange={(e) => setEventTypeOther(e.target.value)}
            placeholder="Précisez le type d'événement"
            className="mt-1"
          />
        )}
      </div>

      {/* Preferred date & time */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <CalendarDays className="h-4 w-4" /> Date souhaitée
          </Label>
          <Input
            type="date"
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4" /> Créneau
          </Label>
          <Input
            type="time"
            value={preferredTimeSlot}
            onChange={(e) => setPreferredTimeSlot(e.target.value)}
          />
        </div>
      </div>

      {/* Date flexible */}
      <div className="flex items-center justify-between">
        <Label className="text-sm">Date flexible ?</Label>
        <Switch checked={isDateFlexible} onCheckedChange={setIsDateFlexible} />
      </div>

      {/* Requirements */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Besoins particuliers</Label>
        <Textarea
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          placeholder="Menu spécial, décoration, sono, privatisation partielle…"
          rows={3}
          className="text-sm"
        />
      </div>

      {/* Budget */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Indication budget (optionnel)</Label>
        <Input
          value={budgetIndication}
          onChange={(e) => setBudgetIndication(e.target.value)}
          placeholder="Ex: 200-500 MAD par personne"
        />
      </div>

      {/* Contact */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Téléphone</Label>
          <Input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+212 6XX XXX XXX"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Email</Label>
          <Input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="votre@email.com"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 text-red-600 text-sm p-3 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={loading || partySize < 16}
        className="w-full h-12 text-base font-semibold"
        size="lg"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
        Envoyer la demande de devis
      </Button>
    </div>
  );
}
