import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown, Search, User } from "lucide-react";
import { COUNTRIES } from "@/lib/countriesData";
import { saveUserProfile } from "@/lib/userData";
import { updateMyConsumerMe } from "@/lib/consumerMeApi";

interface OnboardingScreenProps {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [selectedCountryCode, setSelectedCountryCode] = useState("MA");
  const [city, setCity] = useState("");

  const [countryPopoverOpen, setCountryPopoverOpen] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState("");
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false);
  const [citySearchQuery, setCitySearchQuery] = useState("");

  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Get selected country data
  const selectedCountry = COUNTRIES.find((c) => c.code === selectedCountryCode);

  // Filter countries for search
  const filteredCountries = useMemo(() => {
    if (!countrySearchQuery.trim()) return COUNTRIES;
    const query = countrySearchQuery.toLowerCase();
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.code.toLowerCase().includes(query)
    );
  }, [countrySearchQuery]);

  // Filter cities for search
  const filteredCities = useMemo(() => {
    if (!selectedCountry) return [];
    const cities = selectedCountry.cities || [];
    if (!citySearchQuery.trim()) return cities;
    const query = citySearchQuery.toLowerCase();
    return cities.filter((c) => c.toLowerCase().includes(query));
  }, [selectedCountry, citySearchQuery]);

  // Handle country change — reset city
  const handleCountryChange = (code: string) => {
    setSelectedCountryCode(code);
    setCity("");
    setCountryPopoverOpen(false);
    setCountrySearchQuery("");
  };

  // Form validation
  const isFormValid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    dateOfBirth.length > 0 &&
    city.length > 0;

  const handleSubmit = async () => {
    setLocalError(null);

    if (!firstName.trim()) {
      setLocalError("Le prénom est requis");
      return;
    }
    if (!lastName.trim()) {
      setLocalError("Le nom est requis");
      return;
    }
    if (!dateOfBirth) {
      setLocalError("La date de naissance est requise");
      return;
    }
    if (!city) {
      setLocalError("La ville est requise");
      return;
    }

    setSaving(true);

    try {
      // 1. Save to localStorage
      saveUserProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        date_of_birth: dateOfBirth,
        city,
      });

      // 2. Save to backend
      await updateMyConsumerMe({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: dateOfBirth,
        city,
      });

      onComplete();
    } catch {
      setLocalError("Échec de la sauvegarde. Réessayez.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
          <User className="w-6 h-6 text-primary" />
        </div>
        <h2
          className="text-lg sm:text-xl font-bold text-slate-900"
          style={{ fontFamily: "Circular Std, sans-serif" }}
        >
          Complétez votre profil
        </h2>
        <p className="text-xs text-slate-600 mt-1">
          Ces informations améliorent votre expérience
        </p>
      </div>

      {/* Error */}
      {localError && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {localError}
        </div>
      )}

      {/* Form */}
      <div className="space-y-3">
        {/* Prénom + Nom side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="onboard-firstname" className="text-sm font-medium text-slate-900">
              Prénom
            </Label>
            <Input
              id="onboard-firstname"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Votre prénom"
              disabled={saving}
              className="h-10 rounded-lg text-sm"
              maxLength={60}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="onboard-lastname" className="text-sm font-medium text-slate-900">
              Nom
            </Label>
            <Input
              id="onboard-lastname"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Votre nom"
              disabled={saving}
              className="h-10 rounded-lg text-sm"
              maxLength={60}
            />
          </div>
        </div>

        {/* Date de naissance */}
        <div className="space-y-1.5">
          <Label htmlFor="onboard-dob" className="text-sm font-medium text-slate-900">
            Date de naissance
          </Label>
          <Input
            id="onboard-dob"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            disabled={saving}
            className="h-10 rounded-lg text-sm"
            max={new Date().toISOString().split("T")[0]}
          />
        </div>

        {/* Pays */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-slate-900">Pays</Label>
          <Popover
            open={countryPopoverOpen}
            onOpenChange={(open) => {
              setCountryPopoverOpen(open);
              if (!open) setCountrySearchQuery("");
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between h-10 rounded-lg text-sm font-normal"
                disabled={saving}
              >
                <span className="flex items-center gap-2 truncate">
                  {selectedCountry ? (
                    <>
                      <span>{selectedCountry.flag}</span>
                      <span>{selectedCountry.name}</span>
                    </>
                  ) : (
                    <span className="text-slate-500">Sélectionnez un pays</span>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Rechercher un pays..."
                    value={countrySearchQuery}
                    onChange={(e) => setCountrySearchQuery(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
              </div>
              <div className="max-h-[200px] overflow-y-auto p-1">
                {filteredCountries.length === 0 ? (
                  <div className="py-4 text-center text-sm text-slate-500">
                    Aucun pays trouvé
                  </div>
                ) : (
                  filteredCountries.map((country) => (
                    <button
                      key={country.code}
                      type="button"
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-slate-100 transition-colors ${
                        selectedCountryCode === country.code
                          ? "bg-slate-100 font-medium"
                          : ""
                      }`}
                      onClick={() => handleCountryChange(country.code)}
                    >
                      <span className="text-base">{country.flag}</span>
                      <span className="flex-1 text-left truncate">
                        {country.name}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Ville */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-slate-900">Ville</Label>
          {selectedCountry ? (
            <Popover
              open={cityPopoverOpen}
              onOpenChange={(open) => {
                setCityPopoverOpen(open);
                if (!open) setCitySearchQuery("");
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between h-10 rounded-lg text-sm font-normal"
                  disabled={saving}
                >
                  <span className="truncate">
                    {city || (
                      <span className="text-slate-500">
                        Sélectionnez votre ville
                      </span>
                    )}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Rechercher une ville..."
                      value={citySearchQuery}
                      onChange={(e) => setCitySearchQuery(e.target.value)}
                      className="pl-8 h-9"
                    />
                  </div>
                </div>
                <div className="max-h-[200px] overflow-y-auto p-1">
                  {filteredCities.length === 0 ? (
                    <div className="py-4 text-center text-sm text-slate-500">
                      Aucune ville trouvée
                    </div>
                  ) : (
                    filteredCities.map((cityName) => (
                      <button
                        key={cityName}
                        type="button"
                        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-slate-100 transition-colors ${
                          city === cityName
                            ? "bg-slate-100 font-medium"
                            : ""
                        }`}
                        onClick={() => {
                          setCity(cityName);
                          setCityPopoverOpen(false);
                          setCitySearchQuery("");
                        }}
                      >
                        <span className="flex-1 text-left">{cityName}</span>
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start h-10 rounded-lg text-sm font-normal"
              disabled
            >
              <span className="text-slate-500">Sélectionnez d'abord un pays</span>
            </Button>
          )}
        </div>

        {/* Submit */}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={saving || !isFormValid}
          className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 rounded-lg"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⏳</span>
              Enregistrement...
            </span>
          ) : (
            "Continuer"
          )}
        </Button>
      </div>
    </div>
  );
}
