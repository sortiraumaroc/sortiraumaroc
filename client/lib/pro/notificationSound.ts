function safeVibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function safePlayChime(): void {
  if (typeof window === "undefined") return;

  // Many browsers block audio until the user interacts with the page.
  // We try anyway; if blocked, we silently ignore.
  try {
    const AudioContextCtor = (window.AudioContext || (window as any).webkitAudioContext) as
      | (new () => AudioContext)
      | undefined;
    if (!AudioContextCtor) return;

    const ctx = new AudioContextCtor();
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    master.connect(ctx.destination);

    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(740, now + 0.12);
    osc1.connect(master);
    osc1.start(now);
    osc1.stop(now + 0.18);

    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(660, now + 0.14);
    osc2.frequency.exponentialRampToValueAtTime(520, now + 0.28);
    osc2.connect(master);
    osc2.start(now + 0.14);
    osc2.stop(now + 0.34);

    // Close the context once done.
    window.setTimeout(() => {
      try {
        void ctx.close();
      } catch {
        // ignore
      }
    }, 700);
  } catch {
    // ignore
  }
}

export function playProNotificationSound(): void {
  safeVibrate([25, 35, 25]);
  safePlayChime();
}
