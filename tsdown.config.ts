import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/react.ts'],
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  dts: true,
  // Keep .mjs/.d.mts output so it matches package.json exports.
  fixedExtension: true,
  clean: true,
});
