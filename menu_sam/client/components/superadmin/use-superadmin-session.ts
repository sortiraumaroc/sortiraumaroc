import * as React from "react";

export type SuperadminSessionState =
  | { status: "loading" }
  | { status: "signedOut" }
  | {
      status: "signedIn";
      userId: number;
      email: string | null;
      mustChangePassword: boolean;
      role: "SUPERADMIN" | "UNKNOWN";
    };

function clearSuperadminSession() {
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem("admin_access_token");
      localStorage.removeItem("admin_refresh_token");
      localStorage.removeItem("admin_user");
    }
  } catch {
    // ignore
  }
}

export function useSuperadminSession(): {
  state: SuperadminSessionState;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
} {
  const [state, setState] = React.useState<SuperadminSessionState>({ status: "loading" });

  const refresh = React.useCallback(async () => {
    try {
      const accessToken = localStorage.getItem("admin_access_token");
      const userStr = localStorage.getItem("admin_user");

      if (!accessToken || !userStr) {
        setState({ status: "signedOut" });
        return;
      }

      try {
        const user = JSON.parse(userStr);

        // Verify token is still valid
        const verifyRes = await fetch("/api/auth/verify", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!verifyRes.ok) {
          // Token expired, try to refresh
          const refreshToken = localStorage.getItem("admin_refresh_token");
          if (!refreshToken) {
            clearSuperadminSession();
            setState({ status: "signedOut" });
            return;
          }

          const refreshRes = await fetch("/api/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
          });

          if (!refreshRes.ok) {
            clearSuperadminSession();
            setState({ status: "signedOut" });
            return;
          }

          const refreshData = await refreshRes.json();
          localStorage.setItem("admin_access_token", refreshData.accessToken);
          localStorage.setItem("admin_refresh_token", refreshData.refreshToken);
          localStorage.setItem("admin_user", JSON.stringify(refreshData.user));
        }

        setState({
          status: "signedIn",
          userId: user.id,
          email: user.email ?? null,
          mustChangePassword: false,
          role: "SUPERADMIN",
        });
      } catch (error) {
        console.error("Error refreshing session:", error);
        clearSuperadminSession();
        setState({ status: "signedOut" });
      }
    } catch (error) {
      console.error("Error in refresh:", error);
      setState({ status: "signedOut" });
    }
  }, []);

  React.useEffect(() => {
    void refresh();

    // Check session periodically (every minute)
    const interval = setInterval(() => {
      void refresh();
    }, 60000);

    // Also listen for storage changes (logout from another tab)
    const handleStorageChange = () => {
      void refresh();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("storage", handleStorageChange);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", handleStorageChange);
      }
    };
  }, [refresh]);

  const signOut = React.useCallback(async () => {
    try {
      const accessToken = localStorage.getItem("admin_access_token");
      if (accessToken) {
        await fetch("/api/auth/admin/logout", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
    } catch {
      // ignore errors during logout
    } finally {
      clearSuperadminSession();
      setState({ status: "signedOut" });
    }
  }, []);

  return {
    state,
    refresh,
    signOut,
  };
}
