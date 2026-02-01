export type DemoCredentials = {
  email: string;
  password: string;
};

function getEnvString(key: string): string {
  // Vite exposes only VITE_* variables to the client.
  return String((import.meta as { env?: Record<string, unknown> }).env?.[key] ?? "").trim();
}

export function isDemoModeEnabled(): boolean {
  // Default to false unless explicitly enabled.
  // This prevents demo/localStorage seeds from masking real DB data.
  return getEnvString("VITE_DEMO_MODE").toLowerCase() === "true";
}

export function getDemoConsumerCredentials(): DemoCredentials | null {
  if (!isDemoModeEnabled()) return null;

  const email = getEnvString("VITE_DEMO_CONSUMER_EMAIL").toLowerCase();
  const password = getEnvString("VITE_DEMO_CONSUMER_PASSWORD");

  if (!email || !email.includes("@")) return null;
  if (!password || password.length < 6) return null;

  return { email, password };
}

export function getDemoProCredentials(): DemoCredentials | null {
  if (!isDemoModeEnabled()) return null;

  const email = getEnvString("VITE_DEMO_PRO_EMAIL").toLowerCase();
  const password = getEnvString("VITE_DEMO_PRO_PASSWORD");

  if (!email || !email.includes("@")) return null;
  if (!password || password.length < 6) return null;

  return { email, password };
}

export function getDemoProEmail(): string | null {
  return getDemoProCredentials()?.email ?? null;
}
