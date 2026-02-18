/**
 * Hook to fetch and cache the CE (Comité d'Entreprise) status of the current user.
 *
 * Returns:
 * - isCeEmployee: true if user is linked to a CE company
 * - ceStatus: 'pending' | 'active' | 'suspended' | null
 * - company: { id, name, logo_url } | null
 * - profileComplete: boolean
 * - employeeId: string | null
 * - loading: boolean
 */

import { useCallback, useEffect, useState } from "react";
import { isAuthed } from "@/lib/auth";
import type { CeEmployeeStatus } from "../../shared/ceTypes";

const CACHE_KEY = "ce_status";
const CACHE_TTL = 5 * 60_000; // 5 minutes

type CeStatusCache = {
  data: CeEmployeeStatus;
  ts: number;
};

function readCache(): CeEmployeeStatus | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CeStatusCache = JSON.parse(raw);
    if (Date.now() - cached.ts > CACHE_TTL) return null;
    return cached.data;
  } catch {
    return null;
  }
}

function writeCache(data: CeEmployeeStatus): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // ignore
  }
}

export function clearCeStatusCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

export function useCeStatus() {
  const [data, setData] = useState<CeEmployeeStatus>({
    is_ce_employee: false,
    status: null,
    company: null,
    profile_complete: false,
    employee_id: null,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthed()) {
      setData({ is_ce_employee: false, status: null, company: null, profile_complete: false, employee_id: null });
      setLoading(false);
      return;
    }

    // Check cache first
    const cached = readCache();
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    try {
      const { getCeStatus } = await import("@/lib/cePublicApi");
      const res = await getCeStatus();
      setData(res.data);
      writeCache(res.data);
    } catch {
      setData({ is_ce_employee: false, status: null, company: null, profile_complete: false, employee_id: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    isCeEmployee: data.is_ce_employee,
    isCeActive: data.is_ce_employee && data.status === "active",
    ceStatus: data.status,
    company: data.company,
    profileComplete: data.profile_complete,
    employeeId: data.employee_id,
    loading,
    refresh,
  };
}
