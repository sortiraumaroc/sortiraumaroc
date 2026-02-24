import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // Couleurs de marque Sortir Au Maroc (SAM)
        sam: {
          primary: "#a3001d",
          "primary-hover": "#8a0019",
          "primary-light": "#c9002e",
          "primary-dark": "#7a0016",
          secondary: "#1a1a2e",
          "secondary-light": "#2d2d44",
          accent: "#f4a261",
          "accent-hover": "#e8944f",
          success: "#10b981",
          warning: "#f59e0b",
          error: "#ef4444",
        },
        // Palette Ramadan 2026 — Thème "Mille et Une Nuits"
        ramadan: {
          night: "#0A1628",
          deep: "#1B2A4A",
          gold: "#D4AF37",
          cream: "#FFF8E7",
          bordeaux: "#5C1A1B",
          "gold-light": "#E8D48B",
          "gold-dark": "#B8960C",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        shimmer: {
          "0%": {
            backgroundPosition: "-200% 0",
          },
          "100%": {
            backgroundPosition: "200% 0",
          },
        },
        // Ramadan 2026 — Animations "Mille et Une Nuits"
        "ramadan-twinkle": {
          "0%, 100%": { opacity: "0.3", transform: "scale(0.8)" },
          "50%": { opacity: "1", transform: "scale(1.2)" },
        },
        "ramadan-float-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "20%": { opacity: "1" },
          "80%": { opacity: "1" },
          "100%": { opacity: "0", transform: "translateY(-100px)" },
        },
        "ramadan-lantern-sway": {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
        // Étoile filante — traverse le ciel en diagonale
        "ramadan-shooting-star": {
          "0%": { opacity: "0", transform: "translate(0, 0)" },
          "5%": { opacity: "1" },
          "70%": { opacity: "1" },
          "100%": { opacity: "0", transform: "translate(-300px, 300px)" },
        },
        // Halo lumineux pulsant — pour étoiles brillantes
        "ramadan-glow-pulse": {
          "0%, 100%": {
            opacity: "0.5",
            boxShadow: "0 0 4px 1px rgba(232, 212, 139, 0.3)",
          },
          "50%": {
            opacity: "1",
            boxShadow: "0 0 12px 4px rgba(232, 212, 139, 0.8)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 2s linear infinite",
        // Ramadan 2026
        "ramadan-twinkle": "ramadan-twinkle 3s ease-in-out infinite",
        "ramadan-float-up": "ramadan-float-up 6s ease-in-out infinite",
        "ramadan-lantern-sway": "ramadan-lantern-sway 4s ease-in-out infinite",
        "ramadan-shooting-star": "ramadan-shooting-star var(--shooting-duration, 2.5s) ease-in-out var(--shooting-delay, 8s) infinite",
        "ramadan-glow-pulse": "ramadan-glow-pulse var(--glow-duration, 5s) ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
