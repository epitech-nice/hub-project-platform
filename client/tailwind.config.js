// client/tailwind.config.js
module.exports = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    './app/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'christmas-red': '#DC2626',
        'christmas-green': '#15803D',
        'christmas-gold': '#EAB308',
        'winter-blue': '#3B82F6',
        'spring-pink': '#EC4899',
        'spring-green': '#22C55E',
        'spring-yellow': '#FDE68A',
        'spring-sky': '#38BDF8',
      },
    },
  },
  plugins: [
    function({ addVariant }) {
      addVariant('christmas', ':root.christmas &');
      addVariant('spring', ':root.spring &');
    }
  ],
};
