/**
 * useSessionConflict Hook
 *
 * Hook to check for session conflicts before logging in to a new account type.
 */

import { useState, useCallback, useEffect } from "react";
import {
  AccountType,
  ActiveSession,
  checkSessionConflict,
} from "@/lib/sessionConflict";

type UseSessionConflictReturn = {
  /** Whether there's a conflicting session */
  hasConflict: boolean;
  /** The conflicting session details */
  conflictingSession: ActiveSession | null;
  /** Whether the check is in progress */
  checking: boolean;
  /** Function to check for conflicts */
  checkConflict: () => Promise<boolean>;
  /** Function to clear the conflict state (after user resolves it) */
  clearConflict: () => void;
};

export function useSessionConflict(
  targetType: AccountType
): UseSessionConflictReturn {
  const [conflictingSession, setConflictingSession] =
    useState<ActiveSession | null>(null);
  const [checking, setChecking] = useState(false);

  const checkConflict = useCallback(async (): Promise<boolean> => {
    setChecking(true);
    try {
      const conflict = await checkSessionConflict(targetType);
      setConflictingSession(conflict);
      return conflict !== null;
    } finally {
      setChecking(false);
    }
  }, [targetType]);

  const clearConflict = useCallback(() => {
    setConflictingSession(null);
  }, []);

  // Check on mount
  useEffect(() => {
    void checkConflict();
  }, [checkConflict]);

  return {
    hasConflict: conflictingSession !== null,
    conflictingSession,
    checking,
    checkConflict,
    clearConflict,
  };
}
