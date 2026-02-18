"use client";

import React from "react";
import { Phone, MessageCircle, Mail, Globe, MapPin, User } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import type { WizardData } from "../wizardConstants";

type Props = {
  data: WizardData;
  onChange: (updates: Partial<WizardData>) => void;
};

export default function WizardStepContact({ data, onChange }: Props) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Coordonn&eacute;es de l&rsquo;&eacute;tablissement
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Indiquez les moyens de contact pour vos clients et le
          propri&eacute;taire
        </p>
      </div>

      {/* Section: Contact client */}
      <div className="space-y-5">
        <h3 className="text-base font-semibold text-slate-800">
          Contact client
        </h3>

        {/* Row 1: Téléphone | WhatsApp */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Téléphone */}
          <div className="space-y-2">
            <Label
              htmlFor="phone"
              className="flex items-center gap-2 text-sm font-medium text-slate-700"
            >
              <Phone className="h-4 w-4 text-slate-500" />
              T&eacute;l&eacute;phone <span className="text-red-500">*</span>
            </Label>
            <div className="flex">
              <Badge className="flex h-10 items-center rounded-s-lg rounded-e-none border border-e-0 border-slate-200 bg-slate-100 px-3 text-sm font-medium text-slate-600">
                +212
              </Badge>
              <Input
                id="phone"
                value={data.phone}
                onChange={(e) => onChange({ phone: e.target.value })}
                placeholder="6XXXXXXXX"
                required
                className="rounded-s-none rounded-e-lg"
              />
            </div>
          </div>

          {/* WhatsApp */}
          <div className="space-y-2">
            <Label
              htmlFor="whatsapp"
              className="flex items-center gap-2 text-sm font-medium text-slate-700"
            >
              <MessageCircle className="h-4 w-4 text-slate-500" />
              WhatsApp
            </Label>
            <div className="flex">
              <Badge className="flex h-10 items-center rounded-s-lg rounded-e-none border border-e-0 border-slate-200 bg-slate-100 px-3 text-sm font-medium text-slate-600">
                +212
              </Badge>
              <Input
                id="whatsapp"
                value={data.whatsapp}
                onChange={(e) => onChange({ whatsapp: e.target.value })}
                placeholder="6XXXXXXXX"
                className="rounded-s-none rounded-e-lg"
              />
            </div>
          </div>
        </div>

        {/* Email de réservation (full width) */}
        <div className="space-y-2">
          <Label
            htmlFor="booking_email"
            className="flex items-center gap-2 text-sm font-medium text-slate-700"
          >
            <Mail className="h-4 w-4 text-slate-500" />
            Email de r&eacute;servation
          </Label>
          <Input
            id="booking_email"
            type="email"
            value={data.booking_email}
            onChange={(e) => onChange({ booking_email: e.target.value })}
            placeholder="reservations@votre-etablissement.ma"
            className="rounded-lg"
          />
          <p className="text-xs font-medium text-red-500">
            Sans cet email, le bouton &laquo; R&eacute;server &raquo; ne sera
            pas affich&eacute;
          </p>
        </div>

        {/* Row 2: Google Maps | Site web */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Lien Google Maps */}
          <div className="space-y-2">
            <Label
              htmlFor="google_maps_link"
              className="flex items-center gap-2 text-sm font-medium text-slate-700"
            >
              <MapPin className="h-4 w-4 text-slate-500" />
              Lien Google Maps <span className="text-red-500">*</span>
            </Label>
            <Input
              id="google_maps_link"
              type="url"
              value={data.google_maps_link}
              onChange={(e) => onChange({ google_maps_link: e.target.value })}
              placeholder="https://maps.google.com/..."
              required
              className="rounded-lg"
            />
          </div>

          {/* Site web */}
          <div className="space-y-2">
            <Label
              htmlFor="website"
              className="flex items-center gap-2 text-sm font-medium text-slate-700"
            >
              <Globe className="h-4 w-4 text-slate-500" />
              Site web
            </Label>
            <Input
              id="website"
              type="url"
              value={data.website}
              onChange={(e) => onChange({ website: e.target.value })}
              placeholder="https://www.votre-site.ma"
              className="rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Section: Compte propriétaire */}
      <div className="space-y-5">
        <h3 className="text-base font-semibold text-slate-800">
          Compte propri&eacute;taire
        </h3>

        {/* Email propriétaire */}
        <div className="space-y-2">
          <Label
            htmlFor="owner_email"
            className="flex items-center gap-2 text-sm font-medium text-slate-700"
          >
            <User className="h-4 w-4 text-slate-500" />
            Email propri&eacute;taire
          </Label>
          <Input
            id="owner_email"
            type="email"
            value={data.owner_email}
            onChange={(e) => onChange({ owner_email: e.target.value })}
            placeholder="proprietaire@email.com"
            className="rounded-lg"
          />
          <p className="text-xs text-slate-500">
            Un compte sera cr&eacute;&eacute; avec cet email pour acc&eacute;der
            &agrave; l&rsquo;espace pro
          </p>
        </div>
      </div>
    </div>
  );
}
