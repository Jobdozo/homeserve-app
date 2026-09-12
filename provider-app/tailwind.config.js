/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#15803D",
          dark: "#0F6B31",
          light: "#DCFCE7",
        },
        accent: {
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
