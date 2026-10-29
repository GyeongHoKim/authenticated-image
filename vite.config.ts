import { defineConfig } from 'vite';
import { mockApi } from './dev/mock-api.ts';

export default defineConfig({
  root: 'demo',
  plugins: [mockApi({ photos: true })],
});
