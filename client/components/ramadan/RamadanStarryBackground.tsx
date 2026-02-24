/**
 * RamadanStarryBackground — Ciel étoilé CSS-only
 *
 * 25 étoiles qui scintillent (ramadan-twinkle)
 * 5 étoiles brillantes avec halo pulsant (ramadan-glow-pulse)
 * 4 étoiles filantes qui traversent le ciel (ramadan-shooting-star)
 *
 * Toutes les positions sont déterministes (CSS variables) → pas de layout shift.
 * Toutes les animations sont CSS-only et GPU-accélérées (opacity + transform).
 * pointer-events: none + aria-hidden pour ne pas gêner l'interaction.
 *
 * @media (prefers-reduced-motion: reduce) désactive toutes les animations (global.css).
 */

// ─── 25 étoiles scintillantes (existantes) ───
const STARS: { x: string; y: string; size: string; delay: string; duration: string }[] = [
  { x: "5%",  y: "8%",  size: "2px", delay: "0s",   duration: "3s"   },
  { x: "12%", y: "22%", size: "3px", delay: "0.4s", duration: "4s"   },
  { x: "18%", y: "65%", size: "2px", delay: "1.2s", duration: "3.5s" },
  { x: "25%", y: "35%", size: "4px", delay: "0.8s", duration: "3s"   },
  { x: "30%", y: "12%", size: "2px", delay: "2.1s", duration: "4.5s" },
  { x: "35%", y: "78%", size: "3px", delay: "0.3s", duration: "3s"   },
  { x: "42%", y: "48%", size: "2px", delay: "1.7s", duration: "3.8s" },
  { x: "48%", y: "15%", size: "3px", delay: "0.6s", duration: "4s"   },
  { x: "53%", y: "82%", size: "2px", delay: "2.4s", duration: "3.2s" },
  { x: "58%", y: "30%", size: "4px", delay: "0.1s", duration: "3.5s" },
  { x: "63%", y: "55%", size: "2px", delay: "1.9s", duration: "4.2s" },
  { x: "68%", y: "72%", size: "3px", delay: "0.7s", duration: "3s"   },
  { x: "72%", y: "18%", size: "2px", delay: "2.8s", duration: "3.8s" },
  { x: "78%", y: "42%", size: "3px", delay: "0.2s", duration: "4s"   },
  { x: "82%", y: "88%", size: "2px", delay: "1.5s", duration: "3.5s" },
  { x: "87%", y: "25%", size: "4px", delay: "0.9s", duration: "3s"   },
  { x: "92%", y: "60%", size: "2px", delay: "2.2s", duration: "4.5s" },
  { x: "95%", y: "10%", size: "3px", delay: "0.5s", duration: "3.2s" },
  { x: "8%",  y: "45%", size: "2px", delay: "1.8s", duration: "3.8s" },
  { x: "15%", y: "90%", size: "3px", delay: "0.1s", duration: "4s"   },
  { x: "38%", y: "5%",  size: "2px", delay: "2.6s", duration: "3.5s" },
  { x: "45%", y: "92%", size: "4px", delay: "0.4s", duration: "3s"   },
  { x: "55%", y: "68%", size: "2px", delay: "1.3s", duration: "4.2s" },
  { x: "75%", y: "50%", size: "3px", delay: "2.0s", duration: "3.8s" },
  { x: "90%", y: "38%", size: "2px", delay: "0.8s", duration: "3s"   },
];

// ─── 5 étoiles brillantes avec halo pulsant ───
const BRIGHT_STARS: { x: string; y: string; size: string; delay: string; duration: string }[] = [
  { x: "10%", y: "15%", size: "5px", delay: "0s",   duration: "5s"   },  // haut-gauche
  { x: "88%", y: "12%", size: "6px", delay: "1.2s", duration: "4.5s" },  // haut-droite
  { x: "50%", y: "40%", size: "5px", delay: "2.5s", duration: "5.5s" },  // centre
  { x: "22%", y: "75%", size: "6px", delay: "0.8s", duration: "4s"   },  // bas-gauche
  { x: "80%", y: "70%", size: "5px", delay: "1.8s", duration: "6s"   },  // bas-droite
];

// ─── 4 étoiles filantes (traversent le ciel de temps en temps) ───
const SHOOTING_STARS: {
  x: string; y: string; length: string; delay: string; duration: string;
}[] = [
  { x: "25%", y: "5%",  length: "80px",  delay: "2s",  duration: "2s"   },
  { x: "65%", y: "8%",  length: "100px", delay: "10s", duration: "2.5s" },
  { x: "40%", y: "3%",  length: "70px",  delay: "18s", duration: "1.8s" },
  { x: "80%", y: "12%", length: "90px",  delay: "25s", duration: "2.2s" },
];

export function RamadanStarryBackground() {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      aria-hidden="true"
      style={{ pointerEvents: "none" }}
    >
      {/* Étoiles scintillantes (25) */}
      {STARS.map((star, i) => (
        <span
          key={`s-${i}`}
          className="ramadan-star"
          style={{
            "--star-x": star.x,
            "--star-y": star.y,
            "--star-size": star.size,
            "--star-delay": star.delay,
            "--star-duration": star.duration,
          } as React.CSSProperties}
        />
      ))}

      {/* Étoiles brillantes avec halo (5) */}
      {BRIGHT_STARS.map((star, i) => (
        <span
          key={`b-${i}`}
          className="ramadan-bright-star"
          style={{
            "--bright-x": star.x,
            "--bright-y": star.y,
            "--bright-size": star.size,
            "--glow-delay": star.delay,
            "--glow-duration": star.duration,
          } as React.CSSProperties}
        />
      ))}

      {/* Étoiles filantes (4) */}
      {SHOOTING_STARS.map((star, i) => (
        <span
          key={`sh-${i}`}
          className="ramadan-shooting-star"
          style={{
            "--shooting-x": star.x,
            "--shooting-y": star.y,
            "--shooting-length": star.length,
            "--shooting-delay": star.delay,
            "--shooting-duration": star.duration,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
