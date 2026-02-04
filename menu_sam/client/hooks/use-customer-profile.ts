import * as React from "react";

export type ServiceType = "dineIn" | "takeaway";

export type CustomerProfile = {
  firstName: string;
  serviceType: ServiceType;
  partySize: number;
};

type CustomerProfileState = {
  profile: CustomerProfile | null;
};

function writeProfileState(next: CustomerProfileState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore persistence errors (private mode, quota, etc.)
  }
}

type CustomerProfileApi = {
  profile: CustomerProfile | null;
  setProfile: (next: CustomerProfile) => void;
  clearProfile: () => void;
};

const STORAGE_KEY = "sam_customer_v1";

function safeParseProfile(raw: string | null): CustomerProfileState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CustomerProfileState>;
    if (!parsed || typeof parsed !== "object") return null;

    const p = parsed.profile as Partial<CustomerProfile> | null | undefined;
    if (!p) return { profile: null };

    if (typeof p.firstName !== "string") return { profile: null };
    if (p.serviceType !== "dineIn" && p.serviceType !== "takeaway") return { profile: null };

    const firstName = p.firstName.trim();
    if (!firstName) return { profile: null };

    const partySizeRaw = typeof p.partySize === "number" && Number.isFinite(p.partySize) ? p.partySize : 1;
    const partySize = Math.min(20, Math.max(1, Math.trunc(partySizeRaw)));

    return {
      profile: {
        firstName,
        serviceType: p.serviceType,
        partySize,
      },
    };
  } catch {
    return null;
  }
}

export function useCustomerProfile(): CustomerProfileApi {
  const [state, setState] = React.useState<CustomerProfileState>(() => {
    if (typeof window === "undefined") return { profile: null };
    return safeParseProfile(window.localStorage.getItem(STORAGE_KEY)) ?? { profile: null };
  });

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore persistence errors (private mode, quota, etc.)
    }
  }, [state]);

  const setProfile = React.useCallback((next: CustomerProfile) => {
    const partySize = Math.min(20, Math.max(1, Math.trunc(next.partySize)));
    const profile: CustomerProfile = {
      firstName: next.firstName.trim(),
      serviceType: next.serviceType,
      partySize,
    };

    // Write immediately so a navigation right after onboarding doesn't re-open the gate.
    writeProfileState({ profile });
    setState({ profile });
  }, []);

  const clearProfile = React.useCallback(() => {
    writeProfileState({ profile: null });
    setState({ profile: null });
  }, []);

  return {
    profile: state.profile,
    setProfile,
    clearProfile,
  };
}
