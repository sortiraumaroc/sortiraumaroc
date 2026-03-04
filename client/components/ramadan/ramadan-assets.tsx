/**
 * ramadan-assets.tsx — SVG inline en composants React
 * Thème "Mille et Une Nuits" — Ramadan 2026
 *
 * - CrescentMoonSvg : croissant doré (hero, logo, badges)
 * - LanternSvg : lanterne marocaine (hero desktop)
 * - ArabesquePatternSvg : motif géométrique islamique
 */

import type { SVGProps } from "react";

// =============================================================================
// Croissant de lune doré
// =============================================================================

export function CrescentMoonSvg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="moon-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E8D48B" />
          <stop offset="50%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#B8960C" />
        </linearGradient>
      </defs>
      {/* Croissant principal */}
      <path
        d="M42 6C30.954 6 22 14.954 22 26s8.954 20 20 20c3.87 0 7.49-1.1 10.56-3A24 24 0 0 1 8 26 24 24 0 0 1 42 6Z"
        fill="url(#moon-grad)"
      />
      {/* Étoile décorative */}
      <path
        d="M50 12l1.5 3 3.5.5-2.5 2.5.5 3.5L50 20l-3 1.5.5-3.5L45 15.5l3.5-.5L50 12Z"
        fill="#E8D48B"
        opacity={0.9}
      />
    </svg>
  );
}

// =============================================================================
// Lanterne marocaine
// =============================================================================

export function LanternSvg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="lantern-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#B8960C" />
        </linearGradient>
        <radialGradient id="lantern-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#FFF8E7" stopOpacity={0.6} />
          <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
        </radialGradient>
      </defs>
      {/* Chaîne */}
      <line x1="24" y1="0" x2="24" y2="12" stroke="#D4AF37" strokeWidth="1.5" />
      {/* Capuchon supérieur */}
      <path d="M18 12h12l2 4H16l2-4Z" fill="url(#lantern-body)" />
      {/* Corps de la lanterne */}
      <path
        d="M14 16c0 0 -2 10 -2 24s4 22 12 22 12-8 12-22-2-24-2-24H14Z"
        fill="url(#lantern-body)"
        opacity={0.85}
      />
      {/* Lueur intérieure */}
      <ellipse cx="24" cy="40" rx="8" ry="16" fill="url(#lantern-glow)" />
      {/* Motif arabesque central */}
      <path
        d="M20 28c2 4 6 4 8 0M20 36c2 4 6 4 8 0M20 44c2 4 6 4 8 0"
        stroke="#FFF8E7"
        strokeWidth="0.8"
        opacity={0.5}
        fill="none"
      />
      {/* Pointe inférieure */}
      <path d="M20 62l4 6 4-6" fill="url(#lantern-body)" />
    </svg>
  );
}

// =============================================================================
// Motif arabesque (pattern pour arrière-plan en repeat)
// =============================================================================

export function ArabesquePatternSvg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Motif géométrique islamique simplifié — tuile 80x80 */}
      <g stroke="#D4AF37" strokeWidth="0.5" opacity={0.12}>
        {/* Losange central */}
        <path d="M40 10L70 40 40 70 10 40Z" />
        {/* Arcs intérieurs */}
        <path d="M40 10Q55 25 70 40Q55 55 40 70Q25 55 10 40Q25 25 40 10Z" />
        {/* Petite étoile centrale */}
        <path d="M40 25L45 40 40 55 35 40Z" />
        <path d="M25 40L40 35 55 40 40 45Z" />
        {/* Coins */}
        <path d="M0 0L20 20M80 0L60 20M0 80L20 60M80 80L60 60" />
      </g>
    </svg>
  );
}

/**
 * Data URI du motif arabesque pour utilisation en CSS background-image.
 * Usage : backgroundImage: `url("${ARABESQUE_PATTERN_DATA_URI}")`
 */
export const ARABESQUE_PATTERN_DATA_URI = `data:image/svg+xml,${encodeURIComponent(
  `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke="%23D4AF37" stroke-width="0.5" opacity="0.12"><path d="M40 10L70 40 40 70 10 40Z"/><path d="M40 10Q55 25 70 40Q55 55 40 70Q25 55 10 40Q25 25 40 10Z"/><path d="M40 25L45 40 40 55 35 40Z"/><path d="M25 40L40 35 55 40 40 45Z"/><path d="M0 0L20 20M80 0L60 20M0 80L20 60M80 80L60 60"/></g></svg>`,
)}`;
