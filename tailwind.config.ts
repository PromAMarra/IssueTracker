import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-navy': '#000D4C',
        'brand-navy-2': '#0A1642',
        'brand-blue': '#0026FF',
        'brand-green': '#00DC78',
        'brand-teal': '#009895',
        'brand-orange': '#FF7D00',
        'brand-red': '#FF0D21',
        'brand-gray': '#5A646E',
        'brand-gray-light': '#ECEEEE',
        ink: '#12213F',
        'ink-soft': '#565F78',
        surface: '#F5F7FB',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
