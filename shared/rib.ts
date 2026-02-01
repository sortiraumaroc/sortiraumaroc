export const MOROCCO_BANKS_BY_CODE: Record<string, string> = {
  "007": "Attijariwafa Bank",
  "011": "Bank of Africa – BMCE",
  "013": "Société Générale Maroc",
  "021": "Crédit du Maroc",
  "022": "Crédit Agricole du Maroc",
  "023": "CIH Bank",
  "025": "Al Barid Bank",
  "050": "CFG Bank",
  "045": "Bank Al Yousr",
  "360": "Umnia Bank",
  "225": "BMCI – BNP Paribas",
  "190": "Arab Bank Maroc",
  "130": "CDG Capital",
  "240": "Poste Maroc",
  "310": "Al Akhdar Bank",
  "460": "Bank Assafa",
  "350": "Dar Al Amane",
  "410": "Al Baraka Bank",
};

export type RibParts = {
  bank_code: string; // 3
  locality_code: string; // 3
  branch_code: string; // 3
  account_number: string; // 12
  rib_key: string; // 3
};

export function digitsOnly(input: string): string {
  return String(input || "").replace(/\D+/g, "");
}

export function normalizeRib24(input: string): string {
  return digitsOnly(input).slice(0, 24);
}

export function isValidRib24(input: string): boolean {
  const v = digitsOnly(input);
  return v.length === 24;
}

export function detectMoroccanBankName(bankCode: string): string | null {
  const code = digitsOnly(bankCode).slice(0, 3);
  return MOROCCO_BANKS_BY_CODE[code] ?? null;
}

export function buildRib24FromParts(parts: Partial<RibParts>): string | null {
  const bank_code = digitsOnly(parts.bank_code || "");
  const locality_code = digitsOnly(parts.locality_code || "");
  const branch_code = digitsOnly(parts.branch_code || "");
  const account_number = digitsOnly(parts.account_number || "");
  const rib_key = digitsOnly(parts.rib_key || "");

  if (bank_code.length !== 3) return null;
  if (locality_code.length !== 3) return null;
  if (branch_code.length !== 3) return null;
  if (account_number.length !== 12) return null;
  if (rib_key.length !== 3) return null;

  const rib24 = `${bank_code}${locality_code}${branch_code}${account_number}${rib_key}`;
  return rib24.length === 24 ? rib24 : null;
}

export function splitRib24(rib24: string): RibParts | null {
  const v = digitsOnly(rib24);
  if (v.length !== 24) return null;

  return {
    bank_code: v.slice(0, 3),
    locality_code: v.slice(3, 6),
    branch_code: v.slice(6, 9),
    account_number: v.slice(9, 21),
    rib_key: v.slice(21, 24),
  };
}
