/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Mode accent colors
        cut:      { DEFAULT: "#ef4444", light: "#fef2f2", dark: "#b91c1c" },
        bulk:     { DEFAULT: "#3b82f6", light: "#eff6ff", dark: "#1d4ed8" },
        maintain: { DEFAULT: "#10b981", light: "#ecfdf5", dark: "#065f46" },
        custom:   { DEFAULT: "#8b5cf6", light: "#f5f3ff", dark: "#6d28d9" },
      },
      borderRadius: { xl: "1rem", "2xl": "1.25rem" },
      spacing: {
        micro:    "var(--sp-micro)",
        tight:    "var(--sp-tight)",
        item:     "var(--sp-item)",
        form:     "var(--sp-form)",
        section:  "var(--sp-section)",
        "page-x": "var(--sp-page-x)",
      },
      fontSize: {
        "9":  ["9px",  { lineHeight: "1.4" }],
        "10": ["10px", { lineHeight: "1.4" }],
        "11": ["11px", { lineHeight: "1.4" }],
      },
      boxShadow: {
        card: "0 2px 12px 0 rgba(0,0,0,0.06)",
      },
      keyframes: {
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "15%":      { transform: "translateX(-6px)" },
          "30%":      { transform: "translateX(6px)" },
          "45%":      { transform: "translateX(-5px)" },
          "60%":      { transform: "translateX(5px)" },
          "75%":      { transform: "translateX(-3px)" },
          "90%":      { transform: "translateX(3px)" },
        },
      },
      animation: {
        shake: "shake 0.45s ease-in-out",
      },
    },
  },
  plugins: [],
};
