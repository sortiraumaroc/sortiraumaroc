/**
 * Formulaire de demande de compte parrain
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Check, Loader2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";

import {
  applyAsReferralPartner,
  validateReferralCode,
  type ReferralPartnerType,
} from "@/lib/referral/api";

const formSchema = z.object({
  referral_code: z
    .string()
    .min(3, "Le code doit contenir au moins 3 caractères")
    .max(20, "Le code ne peut pas dépasser 20 caractères")
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "Le code ne peut contenir que des lettres, chiffres, tirets et underscores"
    )
    .optional()
    .or(z.literal("")),
  partner_type: z.enum(["individual", "influencer", "business", "taxi", "hotel", "concierge", "other"]),
  display_name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  bio: z.string().max(500, "La bio ne peut pas dépasser 500 caractères").optional(),
  bank_name: z.string().optional(),
  bank_account_holder: z.string().optional(),
  bank_rib: z
    .string()
    .regex(/^[0-9]{24}$/, "Le RIB doit contenir exactement 24 chiffres")
    .optional()
    .or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

const partnerTypes: { value: ReferralPartnerType; label: string }[] = [
  { value: "individual", label: "Particulier" },
  { value: "influencer", label: "Influenceur" },
  { value: "business", label: "Entreprise" },
  { value: "taxi", label: "Chauffeur de taxi" },
  { value: "hotel", label: "Hôtel / Riad" },
  { value: "concierge", label: "Concierge" },
  { value: "other", label: "Autre" },
];

type Props = {
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function ReferralApplyForm({ onSuccess, onCancel }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [codeChecking, setCodeChecking] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeValid, setCodeValid] = useState<boolean | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      referral_code: "",
      partner_type: "individual",
      display_name: "",
      bio: "",
      bank_name: "",
      bank_account_holder: "",
      bank_rib: "",
    },
  });

  const checkCodeAvailability = async (code: string) => {
    if (!code || code.length < 3) {
      setCodeError(null);
      setCodeValid(null);
      return;
    }

    setCodeChecking(true);
    setCodeError(null);
    setCodeValid(null);

    try {
      const result = await validateReferralCode(code);
      if (result.valid) {
        setCodeError("Ce code est déjà utilisé");
        setCodeValid(false);
      } else if (result.error === "Code de parrainage invalide") {
        // Code doesn't exist = available
        setCodeValid(true);
        setCodeError(null);
      } else {
        setCodeError(result.error || "Erreur de vérification");
        setCodeValid(false);
      }
    } catch {
      setCodeError("Erreur de vérification");
      setCodeValid(false);
    } finally {
      setCodeChecking(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    // Don't submit if code is being checked or is invalid
    if (values.referral_code && codeValid === false) {
      toast({
        title: "Code invalide",
        description: "Veuillez choisir un autre code de parrainage",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const result = await applyAsReferralPartner({
        referral_code: values.referral_code || undefined,
        partner_type: values.partner_type,
        display_name: values.display_name,
        bio: values.bio || undefined,
        bank_name: values.bank_name || undefined,
        bank_account_holder: values.bank_account_holder || undefined,
        bank_rib: values.bank_rib || undefined,
      });

      if (!result.ok) {
        toast({
          title: "Erreur",
          description: result.error || "Erreur lors de la soumission",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Demande envoyée !",
        description: `Votre code parrain sera : ${result.referral_code}`,
      });

      onSuccess?.();
    } catch (err) {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Devenir parrain Sam.ma</CardTitle>
        <CardDescription>
          Remplissez ce formulaire pour demander un compte parrain et commencer à gagner des commissions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Code de parrainage */}
            <FormField
              control={form.control}
              name="referral_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code de parrainage (optionnel)</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        placeholder="Ex: YASSINE2024"
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
                          field.onChange(value);
                          checkCodeAvailability(value);
                        }}
                        className={
                          codeValid === true
                            ? "border-green-500 pr-10"
                            : codeValid === false
                            ? "border-red-500 pr-10"
                            : ""
                        }
                      />
                      {codeChecking && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      {!codeChecking && codeValid === true && (
                        <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                      )}
                    </div>
                  </FormControl>
                  <FormDescription>
                    Proposez votre propre code ou laissez vide pour en générer un automatiquement.
                    3-20 caractères alphanumériques.
                  </FormDescription>
                  {codeError && (
                    <p className="text-sm text-red-500">{codeError}</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Type de parrain */}
            <FormField
              control={form.control}
              name="partner_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type de partenaire</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez votre profil" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {partnerTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Cela nous aide à mieux vous accompagner.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Nom affiché */}
            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom affiché *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Yassine Tours" {...field} />
                  </FormControl>
                  <FormDescription>
                    Ce nom sera visible par vos filleuls.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Bio */}
            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bio (optionnel)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Présentez-vous en quelques mots..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Une courte description de votre activité (max 500 caractères).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Section coordonnées bancaires */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-medium mb-4">
                Coordonnées bancaires (pour les paiements)
              </h3>
              <Alert className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Ces informations peuvent être ajoutées plus tard depuis votre espace parrain.
                </AlertDescription>
              </Alert>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="bank_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Banque</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Attijariwafa Bank" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bank_account_holder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Titulaire du compte</FormLabel>
                      <FormControl>
                        <Input placeholder="Nom complet" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="bank_rib"
                render={({ field }) => (
                  <FormItem className="mt-4">
                    <FormLabel>RIB (24 chiffres)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="000000000000000000000000"
                        maxLength={24}
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, "");
                          field.onChange(value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-4 pt-4">
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
                  Annuler
                </Button>
              )}
              <Button type="submit" disabled={submitting || codeChecking} className="flex-1">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  "Soumettre ma demande"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
