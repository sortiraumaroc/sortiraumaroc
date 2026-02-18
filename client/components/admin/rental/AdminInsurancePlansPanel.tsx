/**
 * AdminInsurancePlansPanel — CRUD for rental insurance plans.
 *
 * Lists all plans in a table, with create/edit Dialog form and delete action.
 */

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Shield, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";

import {
  listAdminInsurancePlans,
  createInsurancePlan,
  updateInsurancePlan,
  deleteInsurancePlan,
} from "@/lib/rentalAdminApi";
import type { RentalInsurancePlan } from "../../../../shared/rentalTypes";

// =============================================================================
// Types
// =============================================================================

interface PlanFormState {
  name: string;
  description: string;
  coverages: string;
  price_per_day: string;
  franchise: string;
  partner_name: string;
  badge: string;
  sort_order: string;
  is_active: boolean;
}

const EMPTY_FORM: PlanFormState = {
  name: "",
  description: "",
  coverages: "",
  price_per_day: "",
  franchise: "",
  partner_name: "",
  badge: "",
  sort_order: "0",
  is_active: true,
};

function planToForm(plan: RentalInsurancePlan): PlanFormState {
  return {
    name: plan.name,
    description: plan.description ?? "",
    coverages: (plan.coverages ?? []).join(", "),
    price_per_day: String(plan.price_per_day ?? ""),
    franchise: String(plan.franchise ?? ""),
    partner_name: plan.partner_name ?? "",
    badge: plan.badge ?? "",
    sort_order: String(plan.sort_order ?? 0),
    is_active: plan.is_active,
  };
}

function formToPayload(form: PlanFormState) {
  return {
    name: form.name,
    description: form.description || undefined,
    coverages: form.coverages
      ? form.coverages
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    price_per_day: parseFloat(form.price_per_day) || 0,
    franchise: parseFloat(form.franchise) || 0,
    partner_name: form.partner_name || null,
    badge: form.badge || null,
    sort_order: parseInt(form.sort_order) || 0,
    is_active: form.is_active,
  };
}

// =============================================================================
// Edit / Create Dialog
// =============================================================================

function PlanEditDialog({
  open,
  onOpenChange,
  plan,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: RentalInsurancePlan | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open && plan) {
      setForm(planToForm(plan));
    } else if (open) {
      setForm(EMPTY_FORM);
    }
    setError(null);
  }, [open, plan]);

  const set = <K extends keyof PlanFormState>(key: K, val: PlanFormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = formToPayload(form);
      if (plan) {
        await updateInsurancePlan(plan.id, payload);
        toast({ title: "Plan mis a jour" });
      } else {
        await createInsurancePlan(payload as any);
        toast({ title: "Plan cree" });
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message ?? "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {plan ? "Modifier le plan d'assurance" : "Nouveau plan d'assurance"}
          </DialogTitle>
          <DialogDescription>
            {plan
              ? "Modifiez les informations du plan d'assurance."
              : "Creez un nouveau plan d'assurance pour le module location."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Nom *</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ex: Assurance Tous Risques"
            />
          </div>

          <div className="col-span-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Description du plan d'assurance"
              rows={3}
            />
          </div>

          <div className="col-span-2">
            <Label>Couvertures (separees par virgule)</Label>
            <Input
              value={form.coverages}
              onChange={(e) => set("coverages", e.target.value)}
              placeholder="Ex: Vol, Incendie, Bris de glace, Dommages collision"
            />
          </div>

          <div>
            <Label>Prix par jour (MAD)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={form.price_per_day}
              onChange={(e) => set("price_per_day", e.target.value)}
              placeholder="0"
            />
          </div>

          <div>
            <Label>Franchise (MAD)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={form.franchise}
              onChange={(e) => set("franchise", e.target.value)}
              placeholder="0"
            />
          </div>

          <div>
            <Label>Nom du partenaire</Label>
            <Input
              value={form.partner_name}
              onChange={(e) => set("partner_name", e.target.value)}
              placeholder="Ex: AXA Assurance"
            />
          </div>

          <div>
            <Label>Badge (optionnel)</Label>
            <Input
              value={form.badge}
              onChange={(e) => set("badge", e.target.value)}
              placeholder="Ex: Recommande"
            />
          </div>

          <div>
            <Label>Ordre d'affichage</Label>
            <Input
              type="number"
              min={0}
              value={form.sort_order}
              onChange={(e) => set("sort_order", e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 pt-6">
            <Checkbox
              id="is_active"
              checked={form.is_active}
              onCheckedChange={(checked) => set("is_active", !!checked)}
            />
            <Label htmlFor="is_active" className="cursor-pointer">
              Actif
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? "Enregistrement..." : plan ? "Mettre a jour" : "Creer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Main Panel
// =============================================================================

export function AdminInsurancePlansPanel() {
  const [plans, setPlans] = useState<RentalInsurancePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<RentalInsurancePlan | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminInsurancePlans();
      setPlans(res.plans ?? []);
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de charger les plans d'assurance",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (plan: RentalInsurancePlan) => {
    if (!confirm(`Supprimer le plan "${plan.name}" ?`)) return;
    try {
      await deleteInsurancePlan(plan.id);
      toast({ title: "Plan supprime" });
      load();
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const openCreate = () => {
    setEditPlan(null);
    setEditOpen(true);
  };

  const openEdit = (plan: RentalInsurancePlan) => {
    setEditPlan(plan);
    setEditOpen(true);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-muted-foreground" />
            Plans d'assurance
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1" /> Nouveau plan
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="text-muted-foreground py-4">Chargement...</p>
          ) : plans.length === 0 ? (
            <div className="py-8 text-center">
              <Shield className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-2 text-sm text-muted-foreground">
                Aucun plan d'assurance configure
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Partenaire</TableHead>
                    <TableHead className="text-right">Prix/jour</TableHead>
                    <TableHead className="text-right">Franchise</TableHead>
                    <TableHead className="text-center">Couvertures</TableHead>
                    <TableHead className="text-center">Statut</TableHead>
                    <TableHead className="text-center">Ordre</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((plan) => (
                      <TableRow key={plan.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{plan.name}</span>
                            {plan.badge && (
                              <Badge variant="outline" className="text-xs">
                                {plan.badge}
                              </Badge>
                            )}
                          </div>
                          {plan.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {plan.description}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {plan.partner_name ?? "---"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {plan.price_per_day} MAD
                        </TableCell>
                        <TableCell className="text-right">
                          {plan.franchise} MAD
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-xs">
                            {(plan.coverages ?? []).length} couvertures
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {plan.is_active ? (
                            <Badge className="bg-green-100 text-green-800">
                              Actif
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-800">
                              Inactif
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {plan.sort_order}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEdit(plan)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-600"
                              onClick={() => handleDelete(plan)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PlanEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        plan={editPlan}
        onSaved={load}
      />
    </div>
  );
}
