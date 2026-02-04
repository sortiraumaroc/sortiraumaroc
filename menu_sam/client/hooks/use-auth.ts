import * as React from "react";
import { toast } from "sonner";

export type AuthUser = {
  id: number;
  email: string;
  type: "admin" | "client";
  name?: string;
};

export type AuthState =
  | { status: "loading" }
  | { status: "signedIn"; user: AuthUser }
  | { status: "signedOut" }
  | { status: "error"; message: string };

interface AuthContextType {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
  refreshToken: () => Promise<boolean>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function useAuth(userType: "admin" | "client"): AuthContextType {
  const [state, setState] = React.useState<AuthState>({ status: "loading" });
  const accessTokenRef = React.useRef<string | null>(null);
  const refreshTokenRef = React.useRef<string | null>(null);

  // Load tokens from localStorage on mount
  React.useEffect(() => {
    const storedAccessToken = localStorage.getItem(`${userType}_access_token`);
    const storedRefreshToken = localStorage.getItem(`${userType}_refresh_token`);
    const storedUser = localStorage.getItem(`${userType}_user`);

    if (storedAccessToken && storedUser) {
      try {
        const user = JSON.parse(storedUser) as AuthUser;
        accessTokenRef.current = storedAccessToken;
        refreshTokenRef.current = storedRefreshToken;
        setState({ status: "signedIn", user });
      } catch {
        localStorage.removeItem(`${userType}_access_token`);
        localStorage.removeItem(`${userType}_refresh_token`);
        localStorage.removeItem(`${userType}_user`);
        setState({ status: "signedOut" });
      }
    } else {
      setState({ status: "signedOut" });
    }
  }, [userType]);

  const signIn = React.useCallback(
    async (email: string, password: string): Promise<boolean> => {
      try {
        setState({ status: "loading" });

        const endpoint = userType === "admin" ? "/api/auth/admin/login" : "/api/auth/client/login";

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const error = await res.json();
          toast.error(error.error || "Login failed");
          setState({ status: "signedOut" });
          return false;
        }

        const data = await res.json();
        const { accessToken, refreshToken, user } = data;

        accessTokenRef.current = accessToken;
        refreshTokenRef.current = refreshToken;

        localStorage.setItem(`${userType}_access_token`, accessToken);
        localStorage.setItem(`${userType}_refresh_token`, refreshToken);
        localStorage.setItem(`${userType}_user`, JSON.stringify(user));

        setState({ status: "signedIn", user });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Login failed";
        toast.error(message);
        setState({ status: "error", message });
        return false;
      }
    },
    [userType],
  );

  const signOut = React.useCallback(async () => {
    try {
      if (accessTokenRef.current) {
        await fetch(
          userType === "admin" ? "/api/auth/admin/logout" : "/api/auth/client/logout",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessTokenRef.current}`,
            },
          },
        );
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      accessTokenRef.current = null;
      refreshTokenRef.current = null;
      localStorage.removeItem(`${userType}_access_token`);
      localStorage.removeItem(`${userType}_refresh_token`);
      localStorage.removeItem(`${userType}_user`);
      setState({ status: "signedOut" });
    }
  }, [userType]);

  const changePassword = React.useCallback(
    async (oldPassword: string, newPassword: string): Promise<boolean> => {
      try {
        if (!accessTokenRef.current) {
          toast.error("Not authenticated");
          return false;
        }

        const endpoint =
          userType === "admin"
            ? "/api/auth/admin/change-password"
            : "/api/auth/client/change-password";

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessTokenRef.current}`,
          },
          body: JSON.stringify({ oldPassword, newPassword }),
        });

        if (!res.ok) {
          const error = await res.json();
          toast.error(error.error || "Failed to change password");
          return false;
        }

        toast.success("Password changed successfully");
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to change password";
        toast.error(message);
        return false;
      }
    },
    [userType],
  );

  const refreshToken = React.useCallback(async (): Promise<boolean> => {
    try {
      if (!refreshTokenRef.current) {
        return false;
      }

      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refreshTokenRef.current }),
      });

      if (!res.ok) {
        await signOut();
        return false;
      }

      const data = await res.json();
      const { accessToken, refreshToken: newRefreshToken, user } = data;

      accessTokenRef.current = accessToken;
      refreshTokenRef.current = newRefreshToken;

      localStorage.setItem(`${userType}_access_token`, accessToken);
      localStorage.setItem(`${userType}_refresh_token`, newRefreshToken);
      localStorage.setItem(`${userType}_user`, JSON.stringify(user));

      setState({ status: "signedIn", user });
      return true;
    } catch (error) {
      await signOut();
      return false;
    }
  }, [userType, signOut]);

  return {
    state,
    signIn,
    signOut,
    changePassword,
    refreshToken,
  };
}

// Hook to get the current access token
export function useAuthToken(userType: "admin" | "client"): string | null {
  const [token, setToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    const stored = localStorage.getItem(`${userType}_access_token`);
    setToken(stored);
  }, [userType]);

  return token;
}
