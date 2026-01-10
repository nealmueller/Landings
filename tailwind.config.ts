import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'IBM Plex Sans'", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["'Fraunces'", "ui-serif", "Georgia", "serif"]
      },
      colors: {
        ink: "#121417",
        bone: "#F3F0E8",
        sage: "#B9C7A5",
        clay: "#C9A07C",
        fog: "#E7E2D8",
        pine: "#2D4A3C",
        sun: "#F9C971"
      },
      boxShadow: {
        card: "0 12px 40px rgba(18, 20, 23, 0.12)",
        glow: "0 0 0 3px rgba(249, 201, 113, 0.4)"
      }
    }
  },
  plugins: []
};

export default config;
