/**
 * RamadanParticles — Particules dorées flottantes CSS-only
 *
 * 15 particules dorées flottant vers le haut.
 * Animation CSS-only via ramadan-float-up.
 * Positions déterministes (pas de random).
 */

const PARTICLES: { x: string; y: string; size: string; delay: string; duration: string }[] = [
  { x: "8%",  y: "10%", size: "3px", delay: "0s",   duration: "5s"   },
  { x: "15%", y: "30%", size: "4px", delay: "0.8s", duration: "6s"   },
  { x: "22%", y: "5%",  size: "3px", delay: "2.1s", duration: "7s"   },
  { x: "30%", y: "20%", size: "5px", delay: "1.2s", duration: "5.5s" },
  { x: "38%", y: "15%", size: "3px", delay: "3.0s", duration: "6.5s" },
  { x: "45%", y: "25%", size: "4px", delay: "0.5s", duration: "5s"   },
  { x: "52%", y: "8%",  size: "3px", delay: "2.5s", duration: "7s"   },
  { x: "60%", y: "18%", size: "5px", delay: "1.8s", duration: "6s"   },
  { x: "68%", y: "12%", size: "3px", delay: "0.3s", duration: "5.5s" },
  { x: "75%", y: "28%", size: "4px", delay: "2.8s", duration: "6.5s" },
  { x: "82%", y: "6%",  size: "3px", delay: "1.5s", duration: "7s"   },
  { x: "88%", y: "22%", size: "5px", delay: "0.7s", duration: "5s"   },
  { x: "93%", y: "16%", size: "3px", delay: "3.2s", duration: "6s"   },
  { x: "35%", y: "32%", size: "4px", delay: "2.0s", duration: "5.5s" },
  { x: "65%", y: "35%", size: "3px", delay: "1.0s", duration: "6.5s" },
];

export function RamadanParticles() {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      aria-hidden="true"
      style={{ pointerEvents: "none" }}
    >
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="ramadan-particle"
          style={{
            "--particle-x": p.x,
            "--particle-y": p.y,
            "--particle-size": p.size,
            "--particle-delay": p.delay,
            "--particle-duration": p.duration,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
