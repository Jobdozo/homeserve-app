/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#D97706",
          dark: "#B45309",
          light: "#FFFBEB",
        },
        ink: {
          DEFAULT: "#14142B",
          soft: "#1E1E3F",
        },
        accent: {
          green: "#16A34A",
          amber: "#F59E0B",
          red: "#DC2626",
          blue: "#2563EB",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 2px 10px rgba(20, 20, 43, 0.06)",
      },
    },
  },
  plugins: [],
};
