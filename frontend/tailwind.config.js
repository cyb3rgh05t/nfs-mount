/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        nfs: {
          primary: "#d8ed18",
          "primary-hover": "#deef45",
          accent: "#e4f162",
          bg: "#030303",
          "bg-dark": "#000000",
          card: "#0a0a0a",
          input: "#1f1f1f",
          border: "#373737",
          text: "#c1c1c1",
          muted: "#868686",
        },
      },
      keyframes: {
        "toast-in": {
          "0%": { opacity: "0", transform: "translateX(100%)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "toast-out": {
          "0%": { opacity: "1", transform: "translateX(0)" },
          "100%": { opacity: "0", transform: "translateX(100%)" },
        },
      },
      animation: {
        "toast-in": "toast-in 0.3s ease-out",
        "toast-out": "toast-out 0.3s ease-in forwards",
      },
    },
  },
  plugins: [],
};
