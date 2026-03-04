/**
 * Panneau Admin pour la gestion du Home Takeover Calendar
 *
 * Fonctionnalités:
 * - Calendrier visuel des réservations
 * - Upload des assets (banners, logo)
 * - Configuration CTA et textes
 * - Confirmation/Rejet des réservations
 */

import { useEffect, useState, useCallback } from "react";
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Upload,
  Image,
  Eye,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Building2,
  ExternalLink,
  Palette,
  Type,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths } from "date-fns";
import { fr } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

type HomeTakeoverDay = {
  id: string;
  date: string;
  campaign_id: string | null;
  establishment_id: string | null;
  establishment_name: string | null;
  price_cents: number;
  winning_bid_cents: number | null;
  status: "available" | "reserved" | "confirmed" | "blocked";
  banner_desktop_url: string | null;
  banner_mobile_url: string | null;
  logo_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  headline: string | null;
  subheadline: string | null;
  background_color: string | null;
  text_color: string | null;
  notes: string | null;
};

type HomeTakeoverCalendarResponse = {
  ok: boolean;
  days: HomeTakeoverDay[];
};

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchHomeTakeoverCalendar(startDate: string, endDate: string): Promise<HomeTakeoverCalendarResponse> {
  const res = await fetch(`/api/admin/ads/home-takeover/calendar?start=${startDate}&end=${endDate}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur lors du chargement du calendrier");
  return res.json();
}

async function updateHomeTakeoverDay(date: string, data: Partial<HomeTakeoverDay>): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/admin/ads/home-takeover/calendar/${date}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Erreur lors de la mise à jour");
  return res.json();
}

async function confirmHomeTakeover(date: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/admin/ads/home-takeover/calendar/${date}/confirm`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur lors de la confirmation");
  return res.json();
}

async function rejectHomeTakeover(date: string, reason: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/admin/ads/home-takeover/calendar/${date}/reject`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error("Erreur lors du rejet");
  return res.json();
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AdminHomeTakeoverPanel() {
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [days, setDays] = useState<HomeTakeoverDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<HomeTakeoverDay | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    banner_desktop_url: "",
    banner_mobile_url: "",
    logo_url: "",
    cta_text: "Découvrir",
    cta_url: "",
    headline: "",
    subheadline: "",
    background_color: "#000000",
    text_color: "#FFFFFF",
    notes: "",
  });

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
      const end = format(endOfMonth(currentMonth), "yyyy-MM-dd");
      const data = await fetchHomeTakeoverCalendar(start, end);
      setDays(data.days || []);
    } catch (err) {
      toast({
        title: "Erreur",
        description: "Impossible de charger le calendrier",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [currentMonth, toast]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  const getDayData = (date: Date): HomeTakeoverDay | undefined => {
    const dateStr = format(date, "yyyy-MM-dd");
    return days.find((d) => d.date === dateStr);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-100 text-green-800 border-green-200";
      case "reserved":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "confirmed":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "blocked":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-50";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "available":
        return "Disponible";
      case "reserved":
        return "Réservé";
      case "confirmed":
        return "Confirmé";
      case "blocked":
        return "Bloqué";
      default:
        return status;
    }
  };

  const handleDayClick = (date: Date) => {
    const dayData = getDayData(date);
    if (dayData) {
      setSelectedDay(dayData);
      setFormData({
        banner_desktop_url: dayData.banner_desktop_url || "",
        banner_mobile_url: dayData.banner_mobile_url || "",
        logo_url: dayData.logo_url || "",
        cta_text: dayData.cta_text || "Découvrir",
        cta_url: dayData.cta_url || "",
        headline: dayData.headline || "",
        subheadline: dayData.subheadline || "",
        background_color: dayData.background_color || "#000000",
        text_color: dayData.text_color || "#FFFFFF",
        notes: dayData.notes || "",
      });
      setEditDialogOpen(true);
    }
  };

  const handleSave = async () => {
    if (!selectedDay) return;
    setSaving(true);
    try {
      await updateHomeTakeoverDay(selectedDay.date, formData);
      toast({ title: "Succès", description: "Configuration enregistrée" });
      setEditDialogOpen(false);
      loadCalendar();
    } catch (err) {
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedDay) return;
    setSaving(true);
    try {
      await confirmHomeTakeover(selectedDay.date);
      toast({ title: "Succès", description: "Home Takeover confirmé et wallet débité" });
      setEditDialogOpen(false);
      loadCalendar();
    } catch (err) {
      toast({
        title: "Erreur",
        description: "Impossible de confirmer",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedDay) return;
    const reason = prompt("Raison du rejet:");
    if (!reason) return;
    setSaving(true);
    try {
      await rejectHomeTakeover(selectedDay.date, reason);
      toast({ title: "Succès", description: "Réservation rejetée" });
      setEditDialogOpen(false);
      loadCalendar();
    } catch (err) {
      toast({
        title: "Erreur",
        description: "Impossible de rejeter",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pending reservations
  const pendingReservations = days.filter((d) => d.status === "reserved");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Home Takeover</h2>
          <p className="text-muted-foreground">
            Gérez les habillages homepage et configurez les visuels
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          {pendingReservations.length} réservation(s) en attente
        </Badge>
      </div>

      {/* Pending Reservations Alert */}
      {pendingReservations.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-yellow-800">
              Réservations à traiter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {pendingReservations.map((day) => (
                <Button
                  key={day.id}
                  variant="outline"
                  size="sm"
                  className="border-yellow-300"
                  onClick={() => handleDayClick(new Date(day.date))}
                >
                  <Calendar className="me-2 h-4 w-4" />
                  {format(new Date(day.date), "d MMM", { locale: fr })} -{" "}
                  {day.establishment_name || "N/A"}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Calendrier
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium min-w-[150px] text-center">
                {format(currentMonth, "MMMM yyyy", { locale: fr })}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
                  <div
                    key={d}
                    className="text-center text-sm font-medium text-muted-foreground py-2"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells for days before month start */}
                {Array.from({ length: (monthStart.getDay() + 6) % 7 }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-24" />
                ))}

                {calendarDays.map((date) => {
                  const dayData = getDayData(date);
                  const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));

                  return (
                    <div
                      key={date.toISOString()}
                      className={cn(
                        "h-24 p-1 border rounded-lg cursor-pointer transition-all hover:shadow-md",
                        isToday(date) && "ring-2 ring-primary",
                        isPast && "opacity-50",
                        dayData ? getStatusColor(dayData.status) : "bg-green-50 border-green-100"
                      )}
                      onClick={() => !isPast && handleDayClick(date)}
                    >
                      <div className="flex flex-col h-full">
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "text-sm font-medium",
                              isToday(date) && "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center"
                            )}
                          >
                            {format(date, "d")}
                          </span>
                          {dayData && (
                            <Badge variant="secondary" className="text-[10px] px-1">
                              {getStatusLabel(dayData.status)}
                            </Badge>
                          )}
                        </div>
                        {dayData && dayData.establishment_name && (
                          <div className="mt-1 text-xs truncate font-medium">
                            {dayData.establishment_name}
                          </div>
                        )}
                        {dayData && (
                          <div className="mt-auto text-xs text-muted-foreground">
                            {((dayData.winning_bid_cents || dayData.price_cents) / 100).toLocaleString()} MAD
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-4 pt-4 border-t">
                <span className="text-sm text-muted-foreground">Légende:</span>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-green-100 border border-green-200" />
                  <span className="text-xs">Disponible</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-200" />
                  <span className="text-xs">Réservé</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-blue-100 border border-blue-200" />
                  <span className="text-xs">Confirmé</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-gray-100 border border-gray-200" />
                  <span className="text-xs">Bloqué</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Home Takeover - {selectedDay && format(new Date(selectedDay.date), "d MMMM yyyy", { locale: fr })}
            </DialogTitle>
            <DialogDescription>
              {selectedDay?.establishment_name && (
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {selectedDay.establishment_name}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedDay && (
            <Tabs defaultValue="assets" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="assets">
                  <Image className="h-4 w-4 me-2" />
                  Visuels
                </TabsTrigger>
                <TabsTrigger value="content">
                  <Type className="h-4 w-4 me-2" />
                  Contenu
                </TabsTrigger>
                <TabsTrigger value="style">
                  <Palette className="h-4 w-4 me-2" />
                  Style
                </TabsTrigger>
              </TabsList>

              {/* Assets Tab */}
              <TabsContent value="assets" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Desktop Banner */}
                  <div className="space-y-2">
                    <Label>Banner Desktop (1920×400px)</Label>
                    <Input
                      placeholder="URL de l'image desktop"
                      value={formData.banner_desktop_url}
                      onChange={(e) =>
                        setFormData({ ...formData, banner_desktop_url: e.target.value })
                      }
                    />
                    {formData.banner_desktop_url && (
                      <div className="border rounded-lg overflow-hidden">
                        <img
                          src={formData.banner_desktop_url}
                          alt="Desktop preview"
                          className="w-full h-24 object-cover"
                        />
                      </div>
                    )}
                  </div>

                  {/* Mobile Banner */}
                  <div className="space-y-2">
                    <Label>Banner Mobile (768×300px)</Label>
                    <Input
                      placeholder="URL de l'image mobile"
                      value={formData.banner_mobile_url}
                      onChange={(e) =>
                        setFormData({ ...formData, banner_mobile_url: e.target.value })
                      }
                    />
                    {formData.banner_mobile_url && (
                      <div className="border rounded-lg overflow-hidden">
                        <img
                          src={formData.banner_mobile_url}
                          alt="Mobile preview"
                          className="w-full h-24 object-cover"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Logo */}
                <div className="space-y-2">
                  <Label>Logo (200×200px, PNG transparent)</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="URL du logo"
                      value={formData.logo_url}
                      onChange={(e) =>
                        setFormData({ ...formData, logo_url: e.target.value })
                      }
                      className="flex-1"
                    />
                    {formData.logo_url && (
                      <div className="w-16 h-16 border rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        <img
                          src={formData.logo_url}
                          alt="Logo preview"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-muted rounded-lg text-sm">
                  <p className="font-medium mb-2">Dimensions recommandées:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Banner Desktop: 1920 × 400 pixels (ratio 4.8:1)</li>
                    <li>Banner Mobile: 768 × 300 pixels (ratio 2.56:1)</li>
                    <li>Logo: 200 × 200 pixels (carré, PNG transparent)</li>
                    <li>Formats acceptés: JPG, PNG, WebP</li>
                    <li>Taille max: 2 Mo par image</li>
                  </ul>
                </div>
              </TabsContent>

              {/* Content Tab */}
              <TabsContent value="content" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Titre principal</Label>
                  <Input
                    placeholder="Ex: Découvrez notre nouvelle carte"
                    value={formData.headline}
                    onChange={(e) =>
                      setFormData({ ...formData, headline: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Sous-titre</Label>
                  <Textarea
                    placeholder="Ex: Des saveurs uniques vous attendent..."
                    value={formData.subheadline}
                    onChange={(e) =>
                      setFormData({ ...formData, subheadline: e.target.value })
                    }
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Texte du bouton CTA</Label>
                    <Input
                      placeholder="Ex: Réserver maintenant"
                      value={formData.cta_text}
                      onChange={(e) =>
                        setFormData({ ...formData, cta_text: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>URL du CTA</Label>
                    <Input
                      placeholder="Ex: /restaurant/mon-resto"
                      value={formData.cta_url}
                      onChange={(e) =>
                        setFormData({ ...formData, cta_url: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes internes</Label>
                  <Textarea
                    placeholder="Notes pour l'équipe (non visibles publiquement)"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    rows={2}
                  />
                </div>
              </TabsContent>

              {/* Style Tab */}
              <TabsContent value="style" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Couleur de fond</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={formData.background_color}
                        onChange={(e) =>
                          setFormData({ ...formData, background_color: e.target.value })
                        }
                        className="w-16 h-10 p-1"
                      />
                      <Input
                        value={formData.background_color}
                        onChange={(e) =>
                          setFormData({ ...formData, background_color: e.target.value })
                        }
                        placeholder="#000000"
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Couleur du texte</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={formData.text_color}
                        onChange={(e) =>
                          setFormData({ ...formData, text_color: e.target.value })
                        }
                        className="w-16 h-10 p-1"
                      />
                      <Input
                        value={formData.text_color}
                        onChange={(e) =>
                          setFormData({ ...formData, text_color: e.target.value })
                        }
                        placeholder="#FFFFFF"
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Style Preview */}
                <div className="space-y-2">
                  <Label>Aperçu du style</Label>
                  <div
                    className="p-6 rounded-lg"
                    style={{
                      backgroundColor: formData.background_color,
                      color: formData.text_color,
                    }}
                  >
                    <h3 className="text-xl font-bold">
                      {formData.headline || "Titre principal"}
                    </h3>
                    <p className="mt-1 opacity-80">
                      {formData.subheadline || "Sous-titre du banner"}
                    </p>
                    <button
                      className="mt-3 px-4 py-2 rounded-lg font-medium"
                      style={{
                        backgroundColor: formData.text_color,
                        color: formData.background_color,
                      }}
                    >
                      {formData.cta_text || "Découvrir"}
                    </button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="mt-6 flex-col sm:flex-row gap-2">
            {selectedDay?.status === "reserved" && (
              <>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={saving}
                >
                  <XCircle className="h-4 w-4 me-2" />
                  Rejeter
                </Button>
                <Button
                  variant="default"
                  onClick={handleConfirm}
                  disabled={saving || !formData.banner_desktop_url}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 me-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 me-2" />
                  )}
                  Confirmer & Débiter
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-4 w-4 me-2" />
              Aperçu
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Aperçu du Home Takeover</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Desktop Preview */}
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">
                Version Desktop
              </Label>
              <div
                className="relative rounded-lg overflow-hidden"
                style={{
                  backgroundColor: formData.background_color,
                  minHeight: "200px",
                }}
              >
                {formData.banner_desktop_url ? (
                  <img
                    src={formData.banner_desktop_url}
                    alt="Desktop banner"
                    className="w-full h-48 object-cover"
                  />
                ) : (
                  <div className="w-full h-48 flex items-center justify-center bg-gray-200">
                    <span className="text-gray-500">Aucun banner desktop</span>
                  </div>
                )}
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ color: formData.text_color }}
                >
                  <div className="text-center">
                    {formData.logo_url && (
                      <img
                        src={formData.logo_url}
                        alt="Logo"
                        className="w-16 h-16 mx-auto mb-4 object-contain"
                      />
                    )}
                    <h2 className="text-3xl font-bold drop-shadow-lg">
                      {formData.headline}
                    </h2>
                    <p className="mt-2 text-lg drop-shadow-md">
                      {formData.subheadline}
                    </p>
                    {formData.cta_text && (
                      <button
                        className="mt-4 px-6 py-2 rounded-lg font-medium shadow-lg"
                        style={{
                          backgroundColor: formData.text_color,
                          color: formData.background_color,
                        }}
                      >
                        {formData.cta_text}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Preview */}
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">
                Version Mobile
              </Label>
              <div
                className="relative rounded-lg overflow-hidden max-w-sm mx-auto"
                style={{
                  backgroundColor: formData.background_color,
                  minHeight: "150px",
                }}
              >
                {formData.banner_mobile_url ? (
                  <img
                    src={formData.banner_mobile_url}
                    alt="Mobile banner"
                    className="w-full h-36 object-cover"
                  />
                ) : (
                  <div className="w-full h-36 flex items-center justify-center bg-gray-200">
                    <span className="text-gray-500">Aucun banner mobile</span>
                  </div>
                )}
                <div
                  className="absolute inset-0 flex items-center justify-center p-4"
                  style={{ color: formData.text_color }}
                >
                  <div className="text-center">
                    <h2 className="text-xl font-bold drop-shadow-lg">
                      {formData.headline}
                    </h2>
                    {formData.cta_text && (
                      <button
                        className="mt-2 px-4 py-1.5 rounded-lg font-medium text-sm shadow-lg"
                        style={{
                          backgroundColor: formData.text_color,
                          color: formData.background_color,
                        }}
                      >
                        {formData.cta_text}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminHomeTakeoverPanel;
