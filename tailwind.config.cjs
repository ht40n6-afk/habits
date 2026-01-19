/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          50: "#f4f6f8",
          100: "#e3e8ef",
          200: "#c8d2e1",
          300: "#a4b3cc",
          400: "#7f90b2",
          500: "#647699",
          600: "#4e5c7a",
          700: "#3c455c",
          800: "#2a3141",
          900: "#161b27"
        }
      }
    }
  },
  plugins: []
};
