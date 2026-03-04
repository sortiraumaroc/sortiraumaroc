import * as React from "react";

import { toast } from "sonner";

import { HelpTooltip } from "@/components/pro/help-tooltip";
import { ProShell } from "@/components/pro/pro-shell";
import { useProPlace } from "@/contexts/pro-place-context";
import { useProSession } from "@/components/pro/use-pro-session";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Trash2, Loader2 } from "lucide-react";

const CONTACT_TYPES = [
  { value: "mobile", label: "Mobile" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "fixe", label: "Téléphone fixe" },
  { value: "email", label: "Email" },
  { value: "site", label: "Site web" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "twitter", label: "Twitter" },
  { value: "waze", label: "Waze" },
  { value: "tiktok", label: "TikTok" },
  { value: "snapchat", label: "Snapchat" },
] as const;

type PlaceRow = {
  placeId: number;
  name: string;
  slogan: string | null;
  city: string | null;
  cityId: number;
  address: string | null;
  phoneOrder: string | null;
  latitude: number | null;
  langitude: number | null;
  geoFenceEnabled: boolean;
  geoFenceRadiusMeters: number;
  logo: string;
};

type PlaceContact = {
  place_contact_id: number;
  place_id: number;
  key: string;
  value: string;
};

function isImage(file: File) {
  return file.type?.startsWith("image/");
}

export default function ProSettings() {
  const { state, signOut } = useProSession();
  const { selectedPlaceId } = useProPlace();

  const [loading, setLoading] = React.useState(true);
  const [row, setRow] = React.useState<PlaceRow | null>(null);

  const [name, setName] = React.useState("");
  const [slogan, setSlogan] = React.useState("");
  const [city, setCity] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [phone, setPhone] = React.useState("");

  const [geoEnabled, setGeoEnabled] = React.useState(false);
  const [geoRadiusKm, setGeoRadiusKm] = React.useState("0.05");
  const [geoLat, setGeoLat] = React.useState("");
  const [geoLng, setGeoLng] = React.useState("");

  // Place contacts
  const [contacts, setContacts] = React.useState<PlaceContact[]>([]);
  const [contactsLoading, setContactsLoading] = React.useState(false);
  const [newContactKey, setNewContactKey] = React.useState("");
  const [newContactValue, setNewContactValue] = React.useState("");
  const [addingContact, setAddingContact] = React.useState(false);

  // Logo
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);

  const ciBaseUrl = "https://www.sam.ma";

  const logoContact = React.useMemo(
    () => contacts.find((c) => c.key === "logo") ?? null,
    [contacts],
  );

  const logoPreview = React.useMemo(() => {
    if (logoFile) return URL.createObjectURL(logoFile);

    const saved = (row?.logo ?? "").trim();
    if (!saved) return "";

    if (/^https?:\/\//i.test(saved)) return saved;

    return `${ciBaseUrl}/assets/uploads/place/${saved}?t=${Date.now()}`;
  }, [logoFile, row?.logo, ciBaseUrl]);

  React.useEffect(() => {
    if (!logoFile) return;
    return () => {
      try {
        URL.revokeObjectURL(logoPreview);
      } catch {
        // ignore
      }
    };
  }, [logoFile, logoPreview]);

  async function uploadToCI(file: File, type: "menu" | "logo"): Promise<string> {
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("type", type);

      const res = await fetch(`${ciBaseUrl}/api/upload_digital/menu`, {
        method: "POST",
        body: form,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.status) {
        const msg = data?.error_message || data?.error || "Upload impossible";
        throw new Error(msg);
      }

      const fileName = data?.fileName;
      if (!fileName || typeof fileName !== "string") {
        throw new Error("Upload OK mais fileName manquant");
      }

      return fileName;
    } finally {
      setUploadingLogo(false);
    }
  }

  const load = React.useCallback(async () => {
    if (state.status !== "signedIn" || !selectedPlaceId) {
      setRow(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/mysql/places/${selectedPlaceId}`);
      if (!response.ok) {
        setRow(null);
        setLoading(false);
        return;
      }

      const placeRow: any = await response.json();

      if (!placeRow) {
        setRow(null);
        setLoading(false);
        return;
      }

      const transformedRow: PlaceRow = {
        placeId: placeRow.placeId,
        name: placeRow.name,
        slogan: placeRow.slogan ?? null,
        city: placeRow.city ?? null,
        cityId: placeRow.cityId,
        address: placeRow.address ?? null,
        phoneOrder: placeRow.phoneOrder ?? null,
        latitude: placeRow.latitude ?? null,
        langitude: placeRow.langitude ?? null,
        geoFenceEnabled: placeRow.geoFenceEnabled ?? false,
        geoFenceRadiusMeters: placeRow.geoFenceRadiusMeters ?? 50,
        logo: placeRow.logo ?? "",
      };

      setRow(transformedRow);
      setName(transformedRow.name);
      setSlogan(transformedRow.slogan ?? "");
      setCity(transformedRow.city ?? "");
      setAddress(transformedRow.address ?? "");
      setPhone(transformedRow.phoneOrder ?? "");

      const enabled = transformedRow.geoFenceEnabled;
      const radiusMeters = transformedRow.geoFenceRadiusMeters;
      setGeoEnabled(enabled);
      setGeoRadiusKm((radiusMeters / 1000).toString());
      setGeoLat(transformedRow.latitude?.toString() ?? "");
      setGeoLng(transformedRow.langitude?.toString() ?? "");
    } catch (error) {
      console.error("Error loading place:", error);
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [state, selectedPlaceId]);

  const loadContacts = React.useCallback(async () => {
    if (!row) return;

    setContactsLoading(true);
    try {
      const response = await fetch(`/api/mysql/places/${row.placeId}/contacts`);
      if (response.ok) {
        const data = await response.json();
        setContacts(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Error loading contacts:", error);
    } finally {
      setContactsLoading(false);
    }
  }, [row]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    void loadContacts();
  }, [row?.placeId, loadContacts]);

  const handleGeoEnabledChange = (checked: boolean) => {
    setGeoEnabled(checked);
    if (!checked) {
      setGeoLat("");
      setGeoLng("");
    }
  };

  const saveLogo = React.useCallback(async () => {
    if (!row) return;

    if (!logoFile) return toast.error("Choisissez une image.");
    if (!isImage(logoFile)) return toast.error("Le fichier doit être une image.");
    if (logoFile.size > 2 * 1024 * 1024) return toast.error("Logo trop grand (max 2MB).");

    try {
      const fileName = await uploadToCI(logoFile, "logo");

      const res = await fetch(`/api/mysql/places/logo/${row.placeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo: fileName }),
      });

      if (!res.ok) throw new Error("Impossible de mettre à jour le logo");

      setRow((prev) => (prev ? { ...prev, logo: fileName } : prev));
      setLogoFile(null);

      toast.success("Logo mis à jour");

      window.dispatchEvent(new Event("sam:place-updated"));
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Upload impossible");
    }
  }, [row, logoFile]);

  const addContact = React.useCallback(async () => {
    if (!row) {
      toast.error("Établissement inaccessible");
      return;
    }

    const key = newContactKey.trim();
    const value = newContactValue.trim();

    if (!key || !value) {
      toast.error("Clé et valeur requises");
      return;
    }

    if (key === "logo") {
      toast.error("Utilisez la section Logo pour modifier le logo.");
      return;
    }

    setAddingContact(true);

    try {
      const response = await fetch(`/api/mysql/places/${row.placeId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });

      if (response.ok) {
        const newContact = await response.json();
        setContacts([...contacts, newContact]);
        setNewContactKey("");
        setNewContactValue("");
        toast.success("Contact ajouté");
      } else {
        toast.error("Impossible d'ajouter le contact");
      }
    } catch (error) {
      console.error("Error adding contact:", error);
      toast.error("Erreur lors de l'ajout du contact");
    } finally {
      setAddingContact(false);
    }
  }, [row, newContactKey, newContactValue, contacts]);

  const deleteContact = React.useCallback(
    async (contactId: number) => {
      if (!row) {
        toast.error("Établissement inaccessible");
        return;
      }

      try {
        const response = await fetch(
          `/api/mysql/places/${row.placeId}/contacts/${contactId}`,
          {
            method: "DELETE",
          },
        );

        if (response.ok) {
          setContacts(contacts.filter((c) => c.place_contact_id !== contactId));
          toast.success("Contact supprimé");
        } else {
          toast.error("Impossible de supprimer le contact");
        }
      } catch (error) {
        console.error("Error deleting contact:", error);
        toast.error("Erreur lors de la suppression du contact");
      }
    },
    [row, contacts],
  );

  const save = React.useCallback(async () => {
    if (!row) {
      toast.message("Établissement inaccessible. Impossible de sauvegarder.");
      return;
    }

    const parsedRadiusKm = Number.parseFloat(geoRadiusKm);
    const radiusMeters = Number.isFinite(parsedRadiusKm)
      ? Math.max(0, Math.round(parsedRadiusKm * 1000))
      : NaN;

    const parsedLat = geoLat.trim().length > 0 ? Number.parseFloat(geoLat) : null;
    const parsedLng = geoLng.trim().length > 0 ? Number.parseFloat(geoLng) : null;

    if (geoEnabled) {
      if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
        toast.message("Rayon invalide. Exemple : 0.05 (50m), 0.5 (500m), 2 (2km)");
        return;
      }
      if (parsedLat === null || parsedLng === null) {
        toast.message("Position manquante. Renseignez latitude + longitude (position du restaurant).");
        return;
      }
      if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
        toast.message("Latitude/Longitude invalides");
        return;
      }
    }

    try {
      const response = await fetch(`/api/mysql/places/${row.placeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slogan: slogan.trim() || null,
          city: city.trim() || null,
          address: address.trim() || null,
          phoneOrder: phone.trim() || null,
          latitude: parsedLat,
          langitude: parsedLng,
          geoFenceEnabled: geoEnabled,
          geoFenceRadiusMeters:
            Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : 50,
        }),
      });

      if (!response.ok) {
        toast.error("Sauvegarde impossible (droits insuffisants ?)");
        return;
      }

      toast.success("Paramètres enregistrés");
      void load();
    } catch (error) {
      console.error("Error saving place:", error);
      toast.error("Erreur lors de la sauvegarde");
    }
  }, [address, city, geoEnabled, geoLat, geoLng, geoRadiusKm, load, name, phone, row, slogan]);

  const email = state.status === "signedIn" ? state.email : null;

  const visibleContacts = React.useMemo(
    () => contacts.filter((c) => c.key !== "logo"),
    [contacts],
  );

  const showSaveFooter = !loading && !!row;

  return (
    <ProShell
      title="Paramètres établissement"
      subtitle={email ? `Connecté : ${email}` : undefined}
      onSignOut={() => void signOut()}
    >
      <div className="w-full space-y-6">
        {/* Identity */}
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold text-black">Identité</div>
            <div className="text-sm text-black/60">
              ID établissement :{" "}
              <span className="font-mono text-black/80">{row?.placeId ?? "—"}</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-black/10 bg-white p-5 text-sm text-black/60 shadow-sm">
            Chargement…
          </div>
        ) : !row ? (
          <div className="rounded-2xl border border-black/10 bg-white p-5 text-sm text-black/60 shadow-sm">
            Impossible de lire l’établissement (compte pas encore rattaché / droits insuffisants).
          </div>
        ) : (
          <>
            {/* LOGO */}
            <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-black">Logo</div>
                <HelpTooltip label="Logo">Changer le logo affiché sur le menu.</HelpTooltip>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-[96px_1fr]">
                <div className="h-24 w-24 overflow-hidden rounded-xl border border-black/10 bg-black/[0.02]">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-black/40">
                      Aucun logo
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={uploadingLogo}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (!f) return;
                      if (!isImage(f)) return toast.error("Choisissez une image.");
                      setLogoFile(f);
                    }}
                    className="h-11 rounded-xl border-black/10 bg-white text-black file:text-black/70"
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => void saveLogo()}
                      disabled={!logoFile || uploadingLogo}
                      className="h-10 rounded-xl bg-sam-red text-white hover:bg-sam-red/90"
                    >
                      {uploadingLogo ? "Upload..." : "Mettre à jour"}
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!logoFile || uploadingLogo}
                      className="h-10 rounded-xl"
                      onClick={() => setLogoFile(null)}
                    >
                      Annuler
                    </Button>
                  </div>

                  {logoContact?.value ? (
                    <div className="text-xs text-black/50">
                      Fichier actuel : <span className="text-black/70">{row.logo}</span>
                    </div>
                  ) : (
                    <div className="text-xs text-black/50">Aucun logo enregistré.</div>
                  )}
                </div>
              </div>
            </div>

            {/* INFOS */}
            <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-black">Infos établissement</div>
                <HelpTooltip label="Aide Infos établissement">
                  Ces infos apparaîtront dans vos supports (et bientôt côté client).
                </HelpTooltip>
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <label className="text-xs font-medium text-black/70">Nom</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 h-11 rounded-xl border-black/10 bg-white text-black placeholder:text-black/40"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-black/70">Slogan</label>
                  <Input
                    value={slogan}
                    onChange={(e) => setSlogan(e.target.value)}
                    placeholder="ex: Le meilleur restaurant de la ville"
                    className="mt-1 h-11 rounded-xl border-black/10 bg-white text-black placeholder:text-black/40"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-black/70">Ville</label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="mt-1 h-11 rounded-xl border-black/10 bg-white text-black placeholder:text-black/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-black/70">Téléphone</label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="ex: 06 12 34 56 78"
                      className="mt-1 h-11 rounded-xl border-black/10 bg-white text-black placeholder:text-black/40"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-black/70">Adresse</label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Adresse complète"
                    className="mt-1 h-11 rounded-xl border-black/10 bg-white text-black placeholder:text-black/40"
                  />
                </div>
              </div>
            </div>

            {/* GEO */}
            <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-black">
                      Accès au menu (géolocalisation)
                    </div>
                    <HelpTooltip label="Aide Accès au menu">
                      Optionnel. Quand activé, le menu est accessible uniquement près du restaurant.
                    </HelpTooltip>
                  </div>
                </div>

                <div className="flex shrink-0 items-center">
                  <label htmlFor="geoEnabled" className="sr-only">
                    Activer la restriction de localisation
                  </label>
                  <Checkbox
                    id="geoEnabled"
                    checked={geoEnabled}
                    onCheckedChange={handleGeoEnabledChange}
                    className={cn(
                      "h-5 w-5 rounded-md border-2 border-black/30 bg-white",
                      "data-[state=checked]:bg-black data-[state=checked]:text-white",
                      "focus-visible:ring-2 focus-visible:ring-black/10 focus-visible:ring-offset-0",
                    )}
                  />
                </div>
              </div>

              {geoEnabled ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-black/70">Rayon (km)</label>
                    <Input
                      value={geoRadiusKm}
                      onChange={(e) => setGeoRadiusKm(e.target.value)}
                      inputMode="decimal"
                      placeholder="ex: 0.05"
                      className="mt-1 h-11 rounded-xl border-black/10 bg-white text-black placeholder:text-black/40"
                    />
                    <div className="mt-1 text-xs text-black/50">
                      0.05 = 50m • 0.5 = 500m • 2 = 2km
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-black/70">Latitude</label>
                      <Input
                        value={geoLat}
                        onChange={(e) => setGeoLat(e.target.value)}
                        inputMode="decimal"
                        placeholder="ex: 31.6561"
                        className="mt-1 h-11 rounded-xl border-black/10 bg-white text-black placeholder:text-black/40"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-black/70">Longitude</label>
                      <Input
                        value={geoLng}
                        onChange={(e) => setGeoLng(e.target.value)}
                        inputMode="decimal"
                        placeholder="ex: -8.0164"
                        className="mt-1 h-11 rounded-xl border-black/10 bg-white text-black placeholder:text-black/40"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl bg-black/[0.02] p-3 text-xs text-black/60">
                    Astuce : copiez les coordonnées depuis Google Maps (clic droit → "Plus d’infos sur cet endroit").
                  </div>
                </div>
              ) : null}
            </div>

            {/* CONTACTS */}
            <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-black">Coordonnées & Contacts</div>
                <HelpTooltip label="Aide Coordonnées">
                  Ajoutez des contacts (téléphone, email, réseaux sociaux, horaires, etc.)
                </HelpTooltip>
              </div>

              <div className="mt-4 space-y-3">
                {contactsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-black/60">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Chargement des contacts…
                  </div>
                ) : (
                  <>
                    {visibleContacts.length > 0 && (
                      <div className="space-y-2">
                        {visibleContacts.map((contact) => (
                          <div
                            key={contact.place_contact_id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-3 hover:bg-black/[0.02]"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-black/60">{contact.key}</div>
                              <div className="mt-0.5 truncate text-sm text-black">{contact.value}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void deleteContact(contact.place_contact_id)}
                              className="flex shrink-0 items-center justify-center h-9 w-9 rounded-lg bg-red-500/10 text-red-600 transition-colors hover:bg-red-500/15"
                              aria-label="Supprimer"
                              title="Supprimer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2 rounded-xl border border-black/10 bg-white p-3">
                      <div>
                        <label className="text-xs font-medium text-black/70">Type de contact</label>
                        <Select value={newContactKey} onValueChange={setNewContactKey}>
                          <SelectTrigger className="mt-1 h-10 rounded-lg border-black/10 bg-white text-sm text-black">
                            <SelectValue placeholder="Sélectionnez un type…" />
                          </SelectTrigger>
                          <SelectContent className="border-black/10 bg-white">
                            {CONTACT_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-black/70">Valeur</label>
                        <Input
                          value={newContactValue}
                          onChange={(e) => setNewContactValue(e.target.value)}
                          placeholder="ex: +212 6 12 34 56 78"
                          className="mt-1 h-10 rounded-lg border-black/10 bg-white text-sm text-black placeholder:text-black/40"
                        />
                      </div>

                      <Button
                        type="button"
                        onClick={() => void addContact()}
                        disabled={addingContact || !newContactKey.trim() || !newContactValue.trim()}
                        className="mt-2 h-9 w-full rounded-lg bg-black text-white hover:bg-black/90 disabled:opacity-50"
                      >
                        {addingContact ? "Ajout..." : "Ajouter"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* SAVE */}
            <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
              <Button
                type="button"
                onClick={() => void save()}
                className="h-11 w-full rounded-xl bg-sam-red text-white hover:bg-sam-red/90"
              >
                Enregistrer
              </Button>
            </div>
          </>
        )}

        {/* Optional little footer hint */}
        {showSaveFooter ? (
          <div className="text-xs text-black/50">
            Conseil : vérifiez le téléphone et l’adresse, ils s’affichent côté client.
          </div>
        ) : null}
      </div>
    </ProShell>
  );
}
