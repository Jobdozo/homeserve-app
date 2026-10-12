/** @type {import('tailwindcss').Config} */
// Tikdum Business runs on a dark ground ("night shift" — see the redesign canvas).
// The stock palettes are re-pointed for it: gray runs from raised surfaces (50–300)
// to text (400–900), and every tint (red-50, emerald-100 …) is a deep wash with a
// light text shade (…-600/700), so older screens read correctly on dark too.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ground: "#0F0D18",
        card: "#1C1929",
        raised: "#262236",
        line: "#332D48",
        ink: { DEFAULT: "#F4F2FA", soft: "#D9D5E8", muted: "#A9A3BF", faint: "#6F6987" },
        // Tikdum violet: everyday buttons, links, selection
        brand: { DEFAULT: "#7B63F5", dark: "#D6CCFF", light: "#2A2155", night: "#2A1A7A", glow: "#8B74FF" },
        // Online · money · accept
        go: { DEFAULT: "#2BC27A", ink: "#06180F", soft: "#6EE0A6", wash: "#12301F", line: "#1F5A39" },
        // New · act now
        marigold: { DEFAULT: "#F5A524", ink: "#1B1530", soft: "#FFE2A8", wash: "#3A2A08" },
        accent: { amber: "#F5A524", red: "#FF7A7A", blue: "#6E9BFF" },
        gray: {
          50: "#1F1B2E",
          100: "#262236",
          200: "#332D48",
          300: "#4A4363",
          400: "#8C86A3",
          500: "#A9A3BF",
          600: "#C4BFD6",
          700: "#D9D5E8",
          800: "#E9E6F3",
          900: "#F4F2FA",
        },
        red: { 50: "#3A1620", 100: "#4A1C28", 200: "#6B2A38", 300: "#8A3A4A", 400: "#FF8F8F", 500: "#FF7A7A", 600: "#FF9C9C", 700: "#FFB3B3", 800: "#FFD6D6", 900: "#FFE8E8" },
        emerald: { 50: "#12301F", 100: "#164A2E", 200: "#1F5A39", 300: "#2E7D52", 400: "#2BC27A", 500: "#2BC27A", 600: "#6EE0A6", 700: "#9FD9BA", 800: "#C3EBD5", 900: "#E1F6EA" },
        green: { 50: "#12301F", 100: "#164A2E", 200: "#1F5A39", 500: "#2BC27A", 600: "#6EE0A6", 700: "#9FD9BA" },
        amber: { 50: "#3A2A08", 100: "#4A360C", 200: "#6B4E12", 300: "#8A6418", 400: "#F5A524", 500: "#F5A524", 600: "#FFC966", 700: "#FFE2A8", 800: "#FFEFCC", 900: "#FFF7E6" },
        blue: { 50: "#152447", 100: "#1B2F5C", 200: "#26407A", 300: "#3A5AA0", 400: "#6E9BFF", 500: "#6E9BFF", 600: "#9CBCFF", 700: "#C2D5FF", 800: "#DDE8FF" },
        violet: { 50: "#2A2155", 100: "#33286A", 500: "#8B74FF", 600: "#B9A9FF", 700: "#D6CCFF", 800: "#E6E0FF" },
        teal: { 100: "#123A3A", 700: "#8EE3DA" },
        orange: { 100: "#3D2410", 700: "#FFC08A" },
        indigo: { 100: "#22265A", 700: "#C7CCFF" },
      },
      fontFamily: {
        sans: ["Figtree", "system-ui", "sans-serif"],
        display: ['"Bricolage Grotesque"', "Figtree", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(255, 255, 255, 0.03) inset, 0 6px 18px rgba(0, 0, 0, 0.35)",
        float: "0 18px 40px rgba(0, 0, 0, 0.55)",
      },
      keyframes: {
        "fade-up": { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "none" } },
        pulsering: { "0%,100%": { boxShadow: "0 0 0 0 rgba(245,165,36,0.35)" }, "50%": { boxShadow: "0 0 0 8px rgba(245,165,36,0)" } },
      },
      animation: {
        "fade-up": "fade-up 0.25s ease-out both",
        pulsering: "pulsering 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
