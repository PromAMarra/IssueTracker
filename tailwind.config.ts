import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-navy': '#000D4C',
        'brand-navy-2': '#0A1642',
        'brand-blue': '#0025FF',
        'brand-green': '#00DB78',
        'brand-teal': '#009895',
        'brand-orange': '#FF7D00',
        'brand-red': '#FF0D20',
        'brand-gray': '#5A646E',
        'brand-gray-light': '#ECEEEE',
        ink: '#000D4C',
        'ink-soft': '#565F78',
        'primary-active': '#001CC4',
        'primary-soft': '#E5E9FF',
        hairline: '#D9DDE3',
        body: '#3A4160',
        surface: '#FFFFFF',
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
