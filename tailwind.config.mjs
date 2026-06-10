/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte,md,mdx}'],
  theme: {
    extend: {
      // Tokens da marca Evolutto — Manual de Marca 2023
      colors: {
        evolutto: {
          blue: '#3363ff', // Azul principal (R51 G99 B255)
          'blue-bright': '#2d5eff', // Ponta do gradiente
          red: '#d93e3f', // Vermelho
          black: '#222222', // Preto da marca
          purple: '#6959dc', // Elemento
          pink: '#db697a', // Elemento
          amber: '#f3c87f', // Elemento
        },
      },
      fontFamily: {
        // Inter — tipografia oficial (Inter Bold / Inter Regular no manual)
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        // Gradiente oficial preto -> azul (#222222 -> #2d5eff)
        'evolutto-gradient': 'linear-gradient(90deg, #222222 0%, #2d5eff 100%)',
      },
    },
  },
  plugins: [],
};
