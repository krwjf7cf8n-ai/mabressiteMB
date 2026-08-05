import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0f4c3a",
          light: "#1f7a5c",
          dark: "#0a3327",
        },
      },
    },
  },
  plugins: [],
};

export default config;
