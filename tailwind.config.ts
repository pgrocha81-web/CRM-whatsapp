import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Temperatura do lead — usado em badges no inbox, pipeline e dashboard
        hot: "#ef4444",
        warm: "#f59e0b",
        cold: "#3b82f6",
        undefined_temp: "#9ca3af",
      },
    },
  },
  plugins: [],
};

export default config;
