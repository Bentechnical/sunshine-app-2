import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint-define-config";

export default defineConfig({
  overrides: [
    {
      files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
      languageOptions: {
        globals: {
          ...globals.browser,
          ...globals.node,
        },
      },
      plugins: ["next"],
      extends: ["next", "next/core-web-vitals"],
      rules: {
        // Add any custom ESLint rules here if needed
      },
    },
  ],
});
