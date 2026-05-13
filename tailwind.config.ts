import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        saffron: '#FF9933',
        sovereign: '#7C3AED',
        success: '#10B981',
        danger: '#EF4444'
      },
      boxShadow: {
        soft: '0 16px 40px -24px rgba(31, 41, 55, 0.55)'
      }
    }
  },
  plugins: []
} satisfies Config;
