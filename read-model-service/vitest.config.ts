import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    // Los tests consumen las fuentes de contracts sin necesidad de compilarlo antes.
    alias: { '@smartparking/contracts': path.resolve(__dirname, '../contracts/src/index.ts') },
  },
  test: { include: ['test/**/*.test.ts'] },
});
