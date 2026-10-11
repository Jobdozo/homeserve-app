/** @type {import('tailwindcss').Config} */
// Tikdum design system (see the "Tikdum App Redesign" canvas):
// violet for actions, night violet for headers and promos, marigold only for
// offers (one highlight per screen), trust green only for ratings, Verified and
// free slots. Bricolage Grotesque for headings and prices, Figtree for reading.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#5B3FE0",
          dark: "#3B23B8",
          light: "#EAE5FF",
          night: "#2A1A7A",
        },
        ink: {
          DEFAULT: "#1B1530",
          soft: "#4A4560",
          muted: "#6B6680",
        },
        mist: "#F6F5FB",
        line: "#E8E5F2",
        marigold: {
          DEFAULT: "#F5A524",
          light: "#FFF4DE",
          dark: "#8A5A00",
        },
        trust: {
          DEFAULT: "#12804A",
          light: "#E7F5EC",
          dark: "#0E6B3D",
        },
        accent: {
          green: "#12804A",
          amber: "#F5A524",
          red: "#DC2626",
        },
      },
      fontFamily: {
        sans: ["Figtree", "system-ui", "sans-serif"],
        display: ["'Bricolage Grotesque'", "Figtree", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 2px 14px rgba(27, 21, 48, 0.06)",
        lift: "0 14px 30px rgba(42, 26, 122, 0.22)",
        float: "0 12px 30px rgba(27, 21, 48, 0.32)",
        cta: "0 12px 28px rgba(91, 63, 224, 0.38)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        pop: {
          "0%": { transform: "scale(0.85)" },
          "60%": { transform: "scale(1.06)" },
          "100%": { transform: "scale(1)" },
        },
        bump: {
          "0%, 100%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.12)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
        "check-draw": {
          from: { strokeDashoffset: "30" },
          to: { strokeDashoffset: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
        "slide-up": "slide-up 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        pop: "pop 0.3s ease-out both",
        bump: "bump 0.35s ease-out",
        shimmer: "shimmer 1.4s linear infinite",
        "check-draw": "check-draw 0.45s ease-out 0.1s both",
      },
    },
  },
  plugins: [],
};
