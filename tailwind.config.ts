import { type Config } from 'tailwindcss';
import * as defaultTheme from 'tailwindcss/defaultTheme';


const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}', // if using app dir
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0e62ae',
          foreground: '#ffffff',
        },
        accent: {
          DEFAULT: '#f09f1a',
          foreground: '#000000',
        },
        background: '#ffffff',
      },
      borderRadius: {
        lg: '1rem',
        xl: '1.5rem',
        '2xl': '2rem',
      },
      fontFamily: {
        fontFamily: {
          sans: ['Inter', ...(defaultTheme as any).fontFamily.sans],
        },
        
      },
    },
  },
  plugins: [],
};

export default config;
