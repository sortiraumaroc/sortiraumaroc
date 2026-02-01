import type { ConsumerMe } from "@/lib/consumerMeApi";

export type BookingPrefillTouched = {
  firstName: boolean;
  lastName: boolean;
  email: boolean;
  phone: boolean;
};

export type BookingPrefillValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export function buildBookingPrefillPatch(args: {
  current: BookingPrefillValues;
  touched: BookingPrefillTouched;
  me: ConsumerMe;
}): Partial<BookingPrefillValues> {
  const patch: Partial<BookingPrefillValues> = {};

  if (!args.touched.firstName && !args.current.firstName.trim() && args.me.first_name) {
    patch.firstName = args.me.first_name;
  }

  if (!args.touched.lastName && !args.current.lastName.trim() && args.me.last_name) {
    patch.lastName = args.me.last_name;
  }

  if (!args.touched.phone && !args.current.phone.trim() && args.me.phone) {
    patch.phone = args.me.phone;
  }

  if (!args.touched.email && !args.current.email.trim() && args.me.email) {
    patch.email = args.me.email;
  }

  return patch;
}
