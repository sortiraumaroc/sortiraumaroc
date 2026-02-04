import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin,
  Phone,
  Mail,
  Globe,
  Instagram,
  Facebook,
  Loader2,
  Save,
  Clock,
  MessageCircle,
  Video,
  Linkedin,
  Camera,
  RefreshCw,
} from "lucide-react";
import { loadAdminSessionToken } from "@/lib/adminApi";

// TikTok icon (not in lucide)
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
  </svg>
);

// Snapchat icon (not in lucide)
const SnapchatIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03a3.27 3.27 0 01-.614-.06 5.87 5.87 0 00-1.213-.135c-.615 0-1.12.074-1.545.255-.39.164-.748.404-1.108.674-.449.336-.929.691-1.65.871a3.635 3.635 0 01-.922.12c-.061 0-.121 0-.195-.015a3.423 3.423 0 01-.899-.121c-.72-.165-1.185-.525-1.635-.856-.375-.284-.72-.524-1.124-.689-.39-.18-.886-.255-1.545-.255a5.78 5.78 0 00-1.213.135 3.27 3.27 0 01-.614.06h-.03c-.255 0-.449-.119-.554-.404a2.1 2.1 0 01-.135-.554 6.807 6.807 0 00-.164-.569c-1.873-.284-2.906-.702-3.146-1.271a.495.495 0 01-.045-.225c-.015-.239.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.659-1.332-.809a3.547 3.547 0 01-.344-.119c-.823-.33-1.228-.72-1.213-1.168 0-.36.284-.689.734-.838.15-.061.33-.09.509-.09.12 0 .3.016.465.104.33.165.704.284 1.018.301.119 0 .24-.03.3-.075l-.03-.51-.004-.06c-.104-1.628-.225-3.654.299-4.848C7.86 1.069 11.216.793 12.206.793z" />
  </svg>
);

type DaySchedule = {
  open: boolean;
  continuous: boolean;
  openTime1?: string;
  closeTime1?: string;
  openTime2?: string;
  closeTime2?: string;
};

type OpeningHours = {
  [key: string]: DaySchedule;
};

type SocialLinks = {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  snapchat?: string;
  linkedin?: string;
  twitter?: string;
};

type ContactInfo = {
  lat?: number;
  lng?: number;
  phone?: string;
  mobile?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  social_links?: SocialLinks;
  hours?: OpeningHours;
};

type Props = {
  establishmentId: string;
};

const DAYS = [
  { key: "monday", label: "Lundi" },
  { key: "tuesday", label: "Mardi" },
  { key: "wednesday", label: "Mercredi" },
  { key: "thursday", label: "Jeudi" },
  { key: "friday", label: "Vendredi" },
  { key: "saturday", label: "Samedi" },
  { key: "sunday", label: "Dimanche" },
];

const DEFAULT_SCHEDULE: DaySchedule = {
  open: true,
  continuous: true,
  openTime1: "09:00",
  closeTime1: "18:00",
};

async function adminApiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const sessionToken = loadAdminSessionToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (sessionToken) {
    headers["x-admin-session"] = sessionToken;
  }

  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers,
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(payload?.error || payload?.message || `HTTP ${res.status}`);
  }

  return payload;
}

export function AdminContactInfoCard({ establishmentId }: Props) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Contact fields
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [phone, setPhone] = useState("");
  const [mobile, setMobile] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");

  // Social links
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [snapchat, setSnapchat] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [youtube, setYoutube] = useState("");

  // Opening hours
  const [hours, setHours] = useState<OpeningHours>(() => {
    const initial: OpeningHours = {};
    DAYS.forEach((d) => {
      initial[d.key] = { ...DEFAULT_SCHEDULE };
    });
    return initial;
  });

  const loadData = useCallback(async () => {
    if (!establishmentId) return;

    setLoading(true);
    try {
      const data = await adminApiFetch(
        `/api/admin/establishments/${encodeURIComponent(establishmentId)}/contact-info`
      );

      if (!data) return;

      setLat(data.lat != null ? String(data.lat) : "");
      setLng(data.lng != null ? String(data.lng) : "");
      setPhone(data.phone ?? "");
      setMobile(data.mobile ?? "");
      setWhatsapp(data.whatsapp ?? "");
      setEmail(data.email ?? "");
      setWebsite(data.website ?? "");

      const social = data.social_links ?? {};
      setInstagram(social.instagram || "");
      setFacebook(social.facebook || "");
      setTiktok(social.tiktok || "");
      setSnapchat(social.snapchat || "");
      setLinkedin(social.linkedin || "");
      setYoutube(social.youtube || "");

      if (data.hours && Object.keys(data.hours).length > 0) {
        setHours(data.hours);
      }
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur de chargement",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [establishmentId, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApiFetch(
        `/api/admin/establishments/${encodeURIComponent(establishmentId)}/contact-info`,
        {
          method: "PATCH",
          body: JSON.stringify({
            lat: lat ? parseFloat(lat) : null,
            lng: lng ? parseFloat(lng) : null,
            phone: phone || null,
            mobile: mobile || null,
            whatsapp: whatsapp || null,
            email: email || null,
            website: website || null,
            social_links: {
              instagram: instagram || null,
              facebook: facebook || null,
              tiktok: tiktok || null,
              snapchat: snapchat || null,
              linkedin: linkedin || null,
              youtube: youtube || null,
            },
            hours,
          }),
        }
      );

      toast({ title: "Informations enregistrées" });
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateDay = (day: string, field: keyof DaySchedule, value: any) => {
    setHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  };

  const applyToAllDays = (sourceDay: string) => {
    const source = hours[sourceDay];
    setHours((prev) => {
      const updated: OpeningHours = {};
      DAYS.forEach((d) => {
        updated[d.key] = { ...source };
      });
      return updated;
    });
    toast({ title: "Horaires appliqués à tous les jours" });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary" />
            Informations de contact
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={loadData}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Localisation */}
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-500" />
            Localisation GPS
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Latitude</Label>
              <Input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="31.6295"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Longitude</Label>
              <Input
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="-7.9811"
                className="h-9 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Téléphones */}
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
            <Phone className="w-4 h-4 text-emerald-500" />
            Téléphones
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Fixe</Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+212 5XX XX XX XX"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Mobile</Label>
              <Input
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="+212 6XX XX XX XX"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <MessageCircle className="w-3 h-3 text-green-500" />
                WhatsApp
              </Label>
              <Input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+212 6XX XX XX XX"
                className="h-9 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Email & Web */}
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4 text-purple-500" />
            Email & Web
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {/* Email de réservation - IMPORTANT pour activer le bouton Réserver */}
            <div className={`p-2 rounded-lg border-2 ${email ? "border-emerald-500 bg-emerald-50" : "border-red-500 bg-red-50"}`}>
              <Label className="text-xs flex items-center gap-1 font-semibold">
                <Mail className="w-3 h-3" />
                Email (Réservation)
                {!email && <span className="text-red-600 text-[10px] font-normal ml-1">REQUIS</span>}
              </Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="reservations@exemple.ma"
                className={`h-9 text-sm mt-1 ${email ? "border-emerald-300" : "border-red-300"}`}
              />
              <p className="text-[10px] text-slate-600 mt-1">
                {email ? "Bouton Réserver activé" : "Sans email = pas de bouton Réserver"}
              </p>
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Globe className="w-3 h-3" />
                Site Web
              </Label>
              <Input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://www.exemple.ma"
                className="h-9 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Réseaux sociaux */}
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
            <Instagram className="w-4 h-4 text-pink-500" />
            Réseaux sociaux
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Instagram className="w-3 h-3 text-pink-500" />
                Instagram
              </Label>
              <Input
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@username"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Facebook className="w-3 h-3 text-blue-600" />
                Facebook
              </Label>
              <Input
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                placeholder="URL ou username"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <TikTokIcon className="w-3 h-3" />
                TikTok
              </Label>
              <Input
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value)}
                placeholder="@username"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <SnapchatIcon className="w-3 h-3 text-yellow-500" />
                Snapchat
              </Label>
              <Input
                value={snapchat}
                onChange={(e) => setSnapchat(e.target.value)}
                placeholder="@username"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Linkedin className="w-3 h-3 text-blue-700" />
                LinkedIn
              </Label>
              <Input
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
                placeholder="URL"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Video className="w-3 h-3 text-red-600" />
                YouTube
              </Label>
              <Input
                value={youtube}
                onChange={(e) => setYoutube(e.target.value)}
                placeholder="URL de la chaîne"
                className="h-9 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Horaires */}
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            Horaires d'ouverture
          </h4>
          <div className="space-y-2">
            {DAYS.map((day) => {
              const schedule = hours[day.key] || DEFAULT_SCHEDULE;
              return (
                <div
                  key={day.key}
                  className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 border border-slate-100"
                >
                  <div className="w-20">
                    <span className="text-sm font-medium text-slate-700">{day.label}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={schedule.open}
                      onCheckedChange={(v) => updateDay(day.key, "open", v)}
                    />
                    <span className="text-xs text-slate-500">{schedule.open ? "Ouvert" : "Fermé"}</span>
                  </div>

                  {schedule.open && (
                    <>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={schedule.continuous}
                          onCheckedChange={(v) => updateDay(day.key, "continuous", v)}
                        />
                        <span className="text-xs text-slate-500">
                          {schedule.continuous ? "Continu" : "Coupure"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Input
                          type="time"
                          value={schedule.openTime1 || "09:00"}
                          onChange={(e) => updateDay(day.key, "openTime1", e.target.value)}
                          className="h-7 w-24 text-xs"
                        />
                        <span className="text-xs text-slate-400">→</span>
                        <Input
                          type="time"
                          value={schedule.closeTime1 || "18:00"}
                          onChange={(e) => updateDay(day.key, "closeTime1", e.target.value)}
                          className="h-7 w-24 text-xs"
                        />
                      </div>

                      {!schedule.continuous && (
                        <>
                          <span className="text-xs font-medium text-slate-500">et</span>
                          <div className="flex items-center gap-1">
                            <Input
                              type="time"
                              value={schedule.openTime2 || "14:00"}
                              onChange={(e) => updateDay(day.key, "openTime2", e.target.value)}
                              className="h-7 w-24 text-xs"
                          />
                            <span className="text-xs text-slate-400">→</span>
                            <Input
                              type="time"
                              value={schedule.closeTime2 || "22:00"}
                              onChange={(e) => updateDay(day.key, "closeTime2", e.target.value)}
                              className="h-7 w-24 text-xs"
                            />
                          </div>
                        </>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] px-2"
                        onClick={() => applyToAllDays(day.key)}
                      >
                        Appliquer à tous
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
