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
      // Add Christmas theme colors
      colors: {
        'christmas-red': '#DC2626',
        'christmas-green': '#15803D',
        'christmas-gold': '#EAB308',
        'winter-blue': '#3B82F6',
      },
    },
  },
  plugins: [
    // Add christmas variant plugin
    function({ addVariant }) {
      addVariant('christmas', ':root.christmas &')
    }
  ],
};
