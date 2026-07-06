import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outExtensions: ({ format }) => ({
    js: format === 'es' ? '.js' : '.cjs',
    dts: format === 'es' ? '.d.ts' : '.d.cts',
  }),
  dts: true,
  sourcemap: true,
  clean: true,
  platform: 'node',
  target: 'node22',
});
