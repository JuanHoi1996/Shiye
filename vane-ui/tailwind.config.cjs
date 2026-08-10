/** @type {import('tailwindcss').Config} */
const themeDark = (colors) => ({
  50: '#141413',
  100: '#1f1f1d',
  200: '#30302e',
  300: '#504e49',
});

const themeLight = (colors) => ({
  50: '#f5f4ed',
  100: '#faf9f5',
  200: '#e8e6dc',
  300: '#d0dce9',
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
          sky: {
            50: '#eef2f7',
            100: '#e4ecf5',
            200: '#d0dce9',
            300: '#aebfd3',
            400: '#5d7fa6',
            500: '#1b365d',
            600: '#162d4e',
            700: '#122641',
            800: '#0f2138',
            900: '#0c1a2d',
          },
          shiye: {
            ink: '#1b365d',
            'ink-light': '#2d5a8a',
            seal: '#8b4513',
            paper: '#f5f4ed',
            stone: '#6b6a64',
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
