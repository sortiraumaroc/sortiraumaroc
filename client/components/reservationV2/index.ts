/**
 * Reservation V2 — Component barrel exports
 */

// 4.1 — Client booking module
export { ReservationV2Module } from "./ReservationV2Module";
export type { ReservationV2ModuleProps } from "./ReservationV2Module";

// 4.1 — Quote request form (group bookings > 15 pers.)
export { QuoteRequestForm } from "./QuoteRequestForm";
export type { QuoteRequestFormProps } from "./QuoteRequestForm";

// 4.2 — Client "My Reservations" space
export { MyReservationsV2 } from "./MyReservationsV2";
export type { MyReservationsV2Props } from "./MyReservationsV2";

// 4.3 — No-show dispute response
export { NoShowDisputeResponse } from "./NoShowDisputeResponse";
export type { NoShowDisputeResponseProps } from "./NoShowDisputeResponse";

// 4.4 — Pro dashboard reservations section
export { ProReservationsV2Dashboard } from "./ProReservationsV2Dashboard";
export type { ProReservationsV2DashboardProps } from "./ProReservationsV2Dashboard";

// 4.5 — Admin dashboard reservations section
export { AdminReservationsV2Dashboard } from "./AdminReservationsV2Dashboard";
export type { AdminReservationsV2DashboardProps } from "./AdminReservationsV2Dashboard";
