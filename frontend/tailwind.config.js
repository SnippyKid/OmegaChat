/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fdf4',   // Very light green
          100: '#dcfce7',  // Light green
          200: '#bbf7d0',  // Lighter green
          300: '#86efac',  // Light green
          400: '#4ade80',  // Medium light green
          500: '#22c55e',  // Base green
          600: '#16a34a',  // Medium green (good for buttons)
          700: '#15803d',  // Darker green
          800: '#166534',  // Dark green
          900: '#14532d',  // Very dark green
        },
        lavender: {
          50: '#f0fdf4',   // Match primary for consistency
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
      },
    },
  },
  plugins: [],
}
