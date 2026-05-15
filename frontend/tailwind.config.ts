import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1f18",
        moss: "#315c3f",
        fern: "#7aaa65",
        limewash: "#eff7db",
        clay: "#c46f3d",
        harbor: "#193f4c",
        mist: "#f4f0e6"
      },
      boxShadow: {
        panel: "0 24px 80px rgba(15, 31, 24, 0.16)"
      }
    }
  },
  plugins: []
};

export default config;

