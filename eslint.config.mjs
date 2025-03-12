// eslint.config.mjs
import nextPlugin from '@next/eslint-plugin-next';

export default [
  {
    plugins: {
      next: nextPlugin
    },
    rules: {
      // Your rules here if needed
    },
    // You can include files it applies to
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"]
  }
];