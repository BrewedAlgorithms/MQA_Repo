/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "on-secondary-fixed": "#121d27",
        "on-primary": "#00315e",
        "surface-container-low": "#1c1b1b",
        "surface-variant": "#353534",
        "inverse-primary": "#005fae",
        "on-background": "#e5e2e1",
        "background": "#131313",
        "secondary-fixed-dim": "#bcc8d6",
        "on-surface-variant": "#c2c6d4",
        "tertiary": "#ffba20",
        "surface-tint": "#a5c8ff",
        "surface-container-highest": "#353534",
        "secondary": "#bcc8d6",
        "inverse-surface": "#e5e2e1",
        "on-primary-container": "#c6dbff",
        "surface-container": "#201f1f",
        "on-tertiary-fixed": "#271900",
        "surface": "#131313",
        "tertiary-container": "#7d5900",
        "on-tertiary-container": "#ffd489",
        "primary": "#a5c8ff",
        "surface-container-lowest": "#0e0e0e",
        "primary-fixed": "#d4e3ff",
        "secondary-container": "#3d4854",
        "on-surface": "#e5e2e1",
        "on-primary-fixed": "#001c3a",
        "surface-bright": "#393939",
        "error": "#ffb4ab",
        "surface-dim": "#131313",
        "on-error": "#690005",
        "error-container": "#93000a",
        "outline": "#8c919d",
        "on-tertiary-fixed-variant": "#5e4200",
        "primary-container": "#0060af",
        "on-tertiary": "#412d00",
        "on-secondary-container": "#abb6c4",
        "on-secondary-fixed-variant": "#3d4854",
        "secondary-fixed": "#d8e4f2",
        "inverse-on-surface": "#313030",
        "tertiary-fixed-dim": "#ffba20",
        "primary-fixed-dim": "#a5c8ff",
        "on-error-container": "#ffdad6",
        "outline-variant": "#424752",
        "surface-container-high": "#2a2a2a",
        "on-secondary": "#27313d",
        "tertiary-fixed": "#ffdea8",
        "on-primary-fixed-variant": "#004785"
      },
      fontFamily: {
        "headline": ["Space Grotesk", "sans-serif"],
        "body": ["Inter", "sans-serif"],
        "label": ["Inter", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      keyframes: {
        "slide-fade": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        }
      },
      animation: {
        "slide-fade": "slide-fade 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      }
    },
  },
  plugins: [],
}
