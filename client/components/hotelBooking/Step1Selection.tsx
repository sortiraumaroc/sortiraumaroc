import { useMemo, useState } from "react";
import { ChevronRight, Minus, Plus } from "lucide-react";

import { DatePickerInput } from "@/components/DatePickerInput";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBooking } from "@/hooks/useBooking";
import { getHotelById } from "@/lib/hotels";

function parseYmd(dateYmd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatYmd(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function nightsBetween(checkIn: Date | null, checkOut: Date | null): number | null {
  if (!checkIn || !checkOut) return null;
  const inTs = new Date(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate()).getTime();
  const outTs = new Date(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate()).getTime();
  if (outTs <= inTs) return null;
  return Math.round((outTs - inTs) / (1000 * 60 * 60 * 24));
}

export default function Step1HotelSelection() {
  const {
    establishmentId,
    partySize,
    setPartySize,
    checkInDate,
    setCheckInDate,
    checkOutDate,
    setCheckOutDate,
    hotelRoomSelection,
    setHotelRoomSelection,
    setCurrentStep,
    canProceed,
  } = useBooking();

  const hotel = useMemo(() => (establishmentId ? getHotelById(establishmentId) : null), [establishmentId]);

  const [roomsCount, setRoomsCount] = useState<number>(hotelRoomSelection?.roomsCount ?? 1);

  const checkInYmd = formatYmd(checkInDate);
  const checkOutYmd = formatYmd(checkOutDate);

  const nights = useMemo(() => nightsBetween(checkInDate, checkOutDate), [checkInDate, checkOutDate]);

  const roomType = hotelRoomSelection?.roomType ?? null;

  const setRooms = (next: number) => {
    const normalized = Math.max(1, Math.min(6, Math.round(next)));
    setRoomsCount(normalized);
    if (roomType) setHotelRoomSelection({ roomType, roomsCount: normalized });
  };

  const handleSelectRoom = (nextRoomType: string) => {
    setHotelRoomSelection({ roomType: nextRoomType, roomsCount });
  };

  const onContinue = () => {
    if (canProceed(1)) setCurrentStep(2);
  };

  const roomOptions = hotel?.rooms ?? [];

  return (
    <div className="space-y-6" style={{ fontFamily: "Circular Std, sans-serif" }}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm">1</div>
        <div>
          <p className="text-xs text-primary font-bold tracking-wider">ÉTAPE 1 SUR 4</p>
          <h2 className="text-lg md:text-xl font-bold text-foreground">Détails du séjour</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground mb-2">Arrivée</div>
          <DatePickerInput
            value={checkInYmd}
            onChange={(v) => {
              const dt = v ? parseYmd(v) : null;
              setCheckInDate(dt);
              if (dt && checkOutDate) {
                const n = nightsBetween(dt, checkOutDate);
                if (n == null) setCheckOutDate(null);
              }
            }}
          />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground mb-2">Départ</div>
          <DatePickerInput
            value={checkOutYmd}
            onChange={(v) => {
              const dt = v ? parseYmd(v) : null;
              setCheckOutDate(dt);
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-sm font-semibold text-foreground mb-2">Voyageurs</div>
          <div className="grid grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPartySize(n)}
                className={cn(
                  "p-3 rounded-lg border-2 transition-all font-semibold text-sm",
                  partySize === n ? "border-primary bg-primary text-white" : "border-slate-300 bg-white hover:border-primary/50 text-slate-700",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold text-foreground mb-2">Chambres</div>
          <div className="flex items-center gap-3 rounded-lg border-2 border-slate-300 bg-white p-3">
            <button
              type="button"
              onClick={() => setRooms(roomsCount - 1)}
              className="h-9 w-9 rounded-md border border-slate-200 hover:bg-slate-50 grid place-items-center"
              aria-label="Diminuer"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="flex-1 text-center">
              <div className="text-sm font-bold text-slate-900">{roomsCount}</div>
              <div className="text-xs text-slate-500">chambre{roomsCount > 1 ? "s" : ""}</div>
            </div>
            <button
              type="button"
              onClick={() => setRooms(roomsCount + 1)}
              className="h-9 w-9 rounded-md border border-slate-200 hover:bg-slate-50 grid place-items-center"
              aria-label="Augmenter"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold text-foreground mb-3">Choisir une chambre</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {roomOptions.map((r) => {
            const active = roomType === r.name;
            return (
              <button
                key={r.name}
                type="button"
                onClick={() => handleSelectRoom(r.name)}
                className={cn(
                  "rounded-2xl border-2 p-4 text-start transition",
                  active ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:border-primary/40",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-bold text-slate-900">{r.name}</div>
                    <div className="mt-1 text-sm text-slate-600">{r.occupancy}</div>
                  </div>
                  {typeof r.priceFromMad === "number" ? (
                    <div className="shrink-0 text-end">
                      <div className="text-xs text-slate-500">À partir de</div>
                      <div className="text-sm font-extrabold text-primary tabular-nums">{new Intl.NumberFormat("fr-MA").format(Math.round(r.priceFromMad))} MAD</div>
                    </div>
                  ) : null}
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
                  {r.highlights.slice(0, 3).map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <span className="mt-0.5 text-slate-500">•</span>
                      <span className="min-w-0">{h}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      </div>

      {partySize && checkInDate && checkOutDate && nights != null && hotelRoomSelection ? (
        <div className="bg-primary/5 p-4 rounded-lg border-2 border-primary/20">
          <p className="text-xs text-slate-600 mb-3 font-semibold tracking-wider">RÉCAPITULATIF</p>
          <div className="space-y-1.5">
            <div className="font-bold text-foreground">{partySize} voyageur{partySize > 1 ? "s" : ""} · {hotelRoomSelection.roomsCount} chambre{hotelRoomSelection.roomsCount > 1 ? "s" : ""}</div>
            <div className="text-sm text-foreground">
              {checkInDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} → {checkOutDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </div>
            <div className="text-sm text-foreground">{nights} nuit{nights > 1 ? "s" : ""} · {hotelRoomSelection.roomType}</div>
          </div>
        </div>
      ) : null}

      <Button type="button" onClick={onContinue} disabled={!canProceed(1)} className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-semibold gap-2">
        Continuer <ChevronRight className="w-5 h-5" />
      </Button>
    </div>
  );
}
