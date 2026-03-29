/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mneti: {
          green:  "#00875A",
          dark:   "#0A0A0A",
          card:   "#111827",
          border: "#1F2937",
          gray:   "#9CA3AF",
          yellow: "#F59E0B",
          red:    "#EF4444",
          blue:   "#3B82F6",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
