import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

import { Header } from "@/components/Header";
import { useBooking } from "@/hooks/useBooking";
import Step1HotelSelection from "@/components/hotelBooking/Step1Selection";
import Step2HotelMode from "@/components/hotelBooking/Step2Mode";
import Step3Info from "@/components/booking/Step3Info";
import Step4HotelConfirmation from "@/components/hotelBooking/Step4Confirmation";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getHotelById } from "@/lib/hotels";

export default function HotelBooking() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const { currentStep, setCurrentStep, setBookingType, setEstablishmentId, reset } = useBooking();

  const hotel = useMemo(() => (hotelId ? getHotelById(hotelId) : null), [hotelId]);

  const steps = useMemo(
    () => [
      { number: 1, label: t("hotel.booking.step.details") },
      { number: 2, label: t("hotel.booking.step.conditions") },
      { number: 3, label: t("hotel.booking.step.info") },
      { number: 4, label: t("hotel.booking.step.confirmation") },
    ],
    [t],
  );

  useEffect(() => {
    setBookingType("hotel");
    setEstablishmentId(hotelId ?? null);
  }, [hotelId, setBookingType, setEstablishmentId]);

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      return;
    }
    navigate(`/hotel/${encodeURIComponent(hotelId ?? "304")}`);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1HotelSelection />;
      case 2:
        return <Step2HotelMode />;
      case 3:
        return <Step3Info />;
      case 4:
        return <Step4HotelConfirmation />;
      default:
        return <Step1HotelSelection />;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <header className="sticky top-16 z-40 bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-primary/5 rounded-lg transition-colors"
            aria-label={t("common.back")}
          >
            <ChevronLeft className="w-6 h-6 text-primary" />
          </button>
          <h1 className="text-base md:text-lg font-bold text-foreground text-center flex-1 font-[Intra,_sans-serif]">
            {hotel?.name ?? t("hotel.booking.title_fallback")}
          </h1>
          <button
            onClick={() => reset()}
            className="text-xs text-slate-600 hover:text-foreground transition-colors hidden sm:block font-medium"
            aria-label={t("common.reset")}
          >
            {t("common.reset")}
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        <div className="flex justify-between items-center mb-10 md:mb-12 gap-2">
          {steps.map((step) => (
            <div key={step.number} className="flex-1 flex flex-col items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all",
                  currentStep >= step.number
                    ? "bg-primary text-white"
                    : "bg-white border-2 border-slate-300 text-slate-600",
                )}
              >
                {step.number}
              </div>
              <p
                className={cn(
                  "text-xs mt-2 transition-all text-center font-medium",
                  currentStep >= step.number ? "text-primary" : "text-slate-500",
                )}
              >
                {step.label}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg border-2 border-slate-200 p-6 md:p-8">{renderStep()}</div>

        <div className="mt-10 text-center">
          <p className="text-xs text-slate-600 font-medium">
            <span className="text-black">{t("hotel.booking.payment_footer")}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
