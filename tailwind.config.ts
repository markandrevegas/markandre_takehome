import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./index.html",
    "./src/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Lexend', 'sans-serif'],
      },
      colors: {
        abyssal: "#1B2632"
      },
      fontSize: {
        'xxs': '0.625rem', // 10px
      }
    },
  },
  plugins: [],
};

export default config;
