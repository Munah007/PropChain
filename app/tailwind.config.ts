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
        // "stadium at night": navy-black atmosphere, validated for the series
        // colors (Over #3987e5 / Under #199e70 pass all checks on surface)
        page: "#080d16",
        surface: "#0f1622",
        raised: "#16202f",
        ink: "#f4f7fc",
        "ink-2": "#b7c2d4",
        "ink-3": "#7d8a9e",
        hairline: "rgba(160,190,255,0.11)",
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
