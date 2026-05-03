import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([{
  files: ["**/*.{js,mjs,cjs}"],
  plugins: {js},
  extends: ["js/recommended"],
  languageOptions: {
    globals: {
      ...globals.browser,
      ...globals.node,
      // tests
      describe: true,
      it: true,
      // frontend
      curt: true,
      send: true,
    },
  },
  linterOptions: {
    reportUnusedDisableDirectives: "off",
  },
  rules: {
    "no-console": "error",
  },
}, {
  files: ["**/*.js"],
  languageOptions: {sourceType: "commonjs"},
}]);
