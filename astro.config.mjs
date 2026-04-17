import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  site: 'https://Duver0.github.io/Antropic-certifications',
  base: '/Antropic-certifications',
  vite: {
    plugins: [tailwindcss()],
  },
});
