export type FinanceOwnerType = "platform" | "establishment" | "user";

export type FinanceAccountCode =
  | "main"
  | "escrow"
  | "revenue"
  | "commission"
  | (string & {});

export type FinanceCurrency = string;

export type FinanceActor = {
  userId: string | null;
  role: string; // e.g. 'admin', 'pro:owner'
};

export type ReservationFinancialSnapshot = {
  id: string;
  establishment_id: string;
  user_id: string | null;

  status: string | null;
  payment_status: string | null;
  checked_in_at: string | null;

  amount_deposit: number | null;
  currency: string | null;

  commission_percent: number | null;
  commission_amount: number | null;
};
