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
        sans: ["'Sora'", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["'Bricolage Grotesque'", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#142033",
        bone: "#F1F6FF",
        sage: "#B9D8CF",
        clay: "#FFB28A",
        fog: "#E4EDF9",
        pine: "#0C4672",
        sun: "#FFD36A"
      },
      boxShadow: {
        card: "0 14px 32px rgba(12, 70, 114, 0.14)",
        glow: "0 0 0 3px rgba(255, 211, 106, 0.45)"
      }
    }
  },
  plugins: []
};

export default config;
