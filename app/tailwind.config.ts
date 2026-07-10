import type { Config } from "tailwindcss";

// Design tokens follow the dataviz reference palette (dark mode, validated):
// surfaces/ink from "chart chrome", series slots for Over/Under, reserved
// status colors for lifecycle states. Single committed dark theme.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        page: "#0d0d0d",
        surface: "#1a1a19",
        raised: "#232322",
        ink: "#ffffff",
        "ink-2": "#c3c2b7",
        "ink-3": "#898781",
        hairline: "rgba(255,255,255,0.10)",
        over: "#3987e5", // categorical slot 1 (dark)
        under: "#199e70", // categorical slot 2 (dark)
        good: "#0ca30c",
        warning: "#fab219",
        serious: "#ec835a",
        critical: "#d03b3b",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
