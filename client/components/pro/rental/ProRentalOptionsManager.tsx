// =============================================================================
// PRO RENTAL OPTIONS MANAGER - CRUD options de location (GPS, siege bebe, etc.)
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Edit3,
  Loader2,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { toast } from "@/hooks/use-toast";
import {
  listProOptions,
  createProOption,
  updateProOption,
  deleteProOption,
} from "@/lib/rentalProApi";
import type { RentalOption, RentalOptionPriceType } from "../../../../shared/rentalTypes";
import { RENTAL_OPTION_PRICE_TYPES } from "../../../../shared/rentalTypes";

// =============================================================================
// TYPES
// =============================================================================

type Props = {
  establishmentId: string;
};

// =============================================================================
// LABELS
// =============================================================================

const PRICE_TYPE_LABELS: Record<RentalOptionPriceType, string> = {
  per_day: "Par jour",
  fixed: "Fixe",
};

// =============================================================================
// DEFAULT FORM STATE
// =============================================================================

interface OptionForm {
  name: string;
  description: string;
  price: number;
  price_type: RentalOptionPriceType;
  is_mandatory: boolean;
}

const DEFAULT_FORM: OptionForm = {
  name: "",
  description: "",
  price: 0,
  price_type: "per_day",
  is_mandatory: false,
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProRentalOptionsManager({ establishmentId }: Props) {
  const [options, setOptions] = useState<RentalOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<RentalOption | null>(null);
  const [form, setForm] = useState<OptionForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<RentalOption | null>(null);
  const [deleting, setDeleting] = useState(false);

  // -----------------------------------------------------------------------
  // Load data
  // -----------------------------------------------------------------------

  const loadOptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { options: data } = await listProOptions();
      setOptions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  // -----------------------------------------------------------------------
  // Dialog
  // -----------------------------------------------------------------------

  const openCreate = () => {
    setEditingOption(null);
    setForm(DEFAULT_FORM);
    setDialogOpen(true);
  };

  const openEdit = (option: RentalOption) => {
    setEditingOption(option);
    setForm({
      name: option.name,
      description: option.description ?? "",
      price: option.price,
      price_type: option.price_type,
      is_mandatory: option.is_mandatory,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingOption(null);
    setForm(DEFAULT_FORM);
  };

  // -----------------------------------------------------------------------
  // Save
  // -----------------------------------------------------------------------

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Erreur", description: "Le nom est requis.", variant: "destructive" });
      return;
    }
    if (form.price < 0) {
      toast({ title: "Erreur", description: "Le prix doit etre positif.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (editingOption) {
        await updateProOption(editingOption.id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          price: form.price,
          price_type: form.price_type,
          is_mandatory: form.is_mandatory,
        } as Partial<RentalOption>);
        toast({ title: "Option mise a jour", description: `${form.name} a ete modifiee.` });
      } else {
        await createProOption({
          establishment_id: establishmentId,
          name: form.name.trim(),
          description: form.description.trim() || null,
          price: form.price,
          price_type: form.price_type,
          is_mandatory: form.is_mandatory,
        } as Parameters<typeof createProOption>[0]);
        toast({ title: "Option creee", description: `${form.name} a ete ajoutee.` });
      }
      closeDialog();
      loadOptions();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Impossible d'enregistrer l'option",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProOption(deleteTarget.id);
      toast({ title: "Option supprimee", description: `${deleteTarget.name} a ete supprimee.` });
      setDeleteTarget(null);
      loadOptions();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Impossible de supprimer l'option",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Chargement des options...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-destructive">{error}</p>
        <Button variant="outline" className="mt-4" onClick={loadOptions}>
          Reessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {options.length} option{options.length > 1 ? "s" : ""}
        </span>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Ajouter une option
        </Button>
      </div>

      {/* Empty state */}
      {options.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Settings2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Aucune option</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ajoutez des options comme un siege bebe, GPS, etc.
            </p>
            <Button onClick={openCreate} className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              Ajouter une option
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead className="text-right">Prix (MAD)</TableHead>
                  <TableHead>Type de prix</TableHead>
                  <TableHead className="text-center">Obligatoire</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {options.map((opt) => (
                  <TableRow key={opt.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{opt.name}</p>
                        {opt.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {opt.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {opt.price.toLocaleString("fr-MA")} MAD
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {PRICE_TYPE_LABELS[opt.price_type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {opt.is_mandatory ? (
                        <Badge className="bg-orange-100 text-orange-800 border-orange-200 border">
                          Obligatoire
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Non</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(opt)} title="Modifier">
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(opt)}
                          title="Supprimer"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {options.map((opt) => (
              <Card key={opt.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{opt.name}</p>
                      {opt.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {opt.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-sm font-semibold">
                          {opt.price.toLocaleString("fr-MA")} MAD
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {PRICE_TYPE_LABELS[opt.price_type]}
                        </Badge>
                        {opt.is_mandatory && (
                          <Badge className="bg-orange-100 text-orange-800 border-orange-200 border text-xs">
                            Obligatoire
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(opt)}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(opt)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingOption ? "Modifier l'option" : "Ajouter une option"}</DialogTitle>
            <DialogDescription>
              {editingOption
                ? "Modifiez les informations de cette option."
                : "Ajoutez une nouvelle option de location."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Siege bebe"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Description optionnelle"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prix (MAD) *</Label>
                <Input
                  type="number"
                  value={form.price || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, price: Number(e.target.value) || 0 }))}
                  placeholder="Ex: 50"
                  min={0}
                />
              </div>

              <div className="space-y-2">
                <Label>Type de prix</Label>
                <Select
                  value={form.price_type}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, price_type: v as RentalOptionPriceType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RENTAL_OPTION_PRICE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {PRICE_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.is_mandatory}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, is_mandatory: v }))}
              />
              <Label>Option obligatoire</Label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingOption ? "Enregistrer" : "Creer l'option"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer l'option</DialogTitle>
            <DialogDescription>
              Etes-vous sur de vouloir supprimer <strong>{deleteTarget?.name}</strong> ?
              Cette action est irreversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
