/** @type {import('tailwindcss').Config} */
const themeDark = (colors) => ({
  50: '#0d1117',
  100: '#161b22',
  200: '#21262d',
  300: '#30363d',
});

const themeLight = (colors) => ({
  50: '#ffffff',
  100: '#f6f8fa',
  200: '#e8edf1',
  300: '#d0d7de',
});

module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      borderColor: ({ colors }) => ({
        light: themeLight(colors),
        dark: themeDark(colors),
      }),
      colors: ({ colors }) => {
        const colorsDark = themeDark(colors);
        const colorsLight = themeLight(colors);
        return {
          shiye: {
            ink: '#2a4f54',
            'ink-light': '#3d6570',
            seal: '#a84840',
            paper: '#f0ebe3',
            stone: '#8b9196',
          },
          dark: {
            primary: colorsDark[50],
            secondary: colorsDark[100],
            ...colorsDark,
          },
          light: {
            primary: colorsLight[50],
            secondary: colorsLight[100],
            ...colorsLight,
          },
        };
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@headlessui/tailwindcss')({ prefix: 'headless' }),
  ],
};
