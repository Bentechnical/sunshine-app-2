// eslint.config.mjs
import { eslint } from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';

export default [
  eslint.configs.recommended,
  {
    plugins: {
      next: nextPlugin
    },
    rules: {
      // your rules here
    }
  }
];