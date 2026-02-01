import { createContext, ReactNode, useContext, useMemo, useState } from "react";

export type ReservationMode = "guaranteed" | "non-guaranteed";
export type ServiceType = "déjeuner" | "continu" | "dîner";
export type BookingType = "restaurant" | "hotel" | "activity";

export type SelectedPack = {
  id: string;
  title: string;
  price?: number;
  originalPrice?: number;
};

export type HotelRoomSelection = {
  roomType: string;
  roomsCount: number;
};

export interface BookingState {
  bookingType: BookingType;
  currentStep: number;
  establishmentId: string | null;

  partySize: number | null;

  /**
   * When true, the user is intentionally requesting a full slot as a waitlist request.
   * This bypasses capacity checks in the UI (capacity is still enforced server-side).
   */
  waitlistRequested: boolean;

  // Restaurant fields
  selectedDate: Date | null;
  selectedTime: string | null;
  selectedService: ServiceType | null;
  selectedPack: SelectedPack | null;

  // Hotel fields
  checkInDate: Date | null;
  checkOutDate: Date | null;
  hotelRoomSelection: HotelRoomSelection | null;

  reservationMode: ReservationMode | null;

  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;

  bookingReference: string | null;

  setBookingType: (type: BookingType) => void;
  setWaitlistRequested: (requested: boolean) => void;
  setCurrentStep: (step: number) => void;
  setEstablishmentId: (id: string | null) => void;

  setPartySize: (size: number | null) => void;

  setSelectedDate: (date: Date | null) => void;
  setSelectedTime: (time: string | null) => void;
  setSelectedService: (service: ServiceType | null) => void;
  setSelectedPack: (pack: SelectedPack | null) => void;

  setCheckInDate: (date: Date | null) => void;
  setCheckOutDate: (date: Date | null) => void;
  setHotelRoomSelection: (sel: HotelRoomSelection | null) => void;

  setReservationMode: (mode: ReservationMode | null) => void;

  setFirstName: (name: string) => void;
  setLastName: (name: string) => void;
  setEmail: (email: string) => void;
  setPhone: (phone: string) => void;
  setMessage: (message: string) => void;

  setBookingReference: (ref: string | null) => void;
  reset: () => void;
  canProceed: (step: number) => boolean;
  generateBookingReference: () => string;
}

const BookingContext = createContext<BookingState | undefined>(undefined);

function isValidHotelDates(checkIn: Date | null, checkOut: Date | null): boolean {
  if (!checkIn || !checkOut) return false;
  const inTs = new Date(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate()).getTime();
  const outTs = new Date(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate()).getTime();
  return outTs > inTs;
}

export const BookingProvider = ({ children }: { children: ReactNode }) => {
  const [bookingType, setBookingType] = useState<BookingType>("restaurant");
  const [currentStep, setCurrentStep] = useState(1);
  const [establishmentId, setEstablishmentId] = useState<string | null>(null);

  const [partySize, setPartySize] = useState<number | null>(null);

  const [waitlistRequested, setWaitlistRequested] = useState(false);

  // Restaurant
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceType | null>(null);
  const [selectedPack, setSelectedPack] = useState<SelectedPack | null>(null);

  // Hotel
  const [checkInDate, setCheckInDate] = useState<Date | null>(null);
  const [checkOutDate, setCheckOutDate] = useState<Date | null>(null);
  const [hotelRoomSelection, setHotelRoomSelection] = useState<HotelRoomSelection | null>(null);

  const [reservationMode, setReservationMode] = useState<ReservationMode | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [bookingReference, setBookingReference] = useState<string | null>(null);

  const generateBookingReference = (): string => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `SAM${timestamp}${random}`;
  };

  const canProceed = useMemo(() => {
    return (step: number) => {
      switch (step) {
        case 1:
          if (bookingType === "hotel") {
            return (
              partySize !== null &&
              isValidHotelDates(checkInDate, checkOutDate) &&
              hotelRoomSelection !== null
            );
          }
          if (bookingType === "activity") {
            return partySize !== null && selectedDate !== null && selectedTime !== null;
          }
          return (
            partySize !== null &&
            selectedDate !== null &&
            selectedTime !== null &&
            selectedService !== null
          );
        case 2:
          return reservationMode !== null;
        case 3:
          return firstName.trim() !== "" && lastName.trim() !== "" && phone.trim() !== "";
        case 4:
          return true;
        default:
          return false;
      }
    };
  }, [bookingType, partySize, selectedDate, selectedTime, selectedService, checkInDate, checkOutDate, hotelRoomSelection, reservationMode, firstName, lastName, phone]);

  const reset = () => {
    setBookingType("restaurant");
    setCurrentStep(1);
    setEstablishmentId(null);

    setPartySize(null);
    setWaitlistRequested(false);

    setSelectedDate(null);
    setSelectedTime(null);
    setSelectedService(null);
    setSelectedPack(null);

    setCheckInDate(null);
    setCheckOutDate(null);
    setHotelRoomSelection(null);

    setReservationMode(null);

    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setMessage("");
    setBookingReference(null);
  };

  const value: BookingState = {
    bookingType,
    currentStep,
    establishmentId,

    partySize,
    waitlistRequested,

    selectedDate,
    selectedTime,
    selectedService,
    selectedPack,

    checkInDate,
    checkOutDate,
    hotelRoomSelection,

    reservationMode,

    firstName,
    lastName,
    email,
    phone,
    message,

    bookingReference,

    setBookingType,
    setCurrentStep,
    setEstablishmentId,
    setPartySize,
    setWaitlistRequested,
    setSelectedDate,
    setSelectedTime,
    setSelectedService,
    setSelectedPack,
    setCheckInDate,
    setCheckOutDate,
    setHotelRoomSelection,
    setReservationMode,
    setFirstName,
    setLastName,
    setEmail,
    setPhone,
    setMessage,
    setBookingReference,
    reset,
    canProceed,
    generateBookingReference,
  };

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
};

export const useBooking = () => {
  const context = useContext(BookingContext);
  if (context === undefined) {
    throw new Error("useBooking must be used within a BookingProvider");
  }
  return context;
};
