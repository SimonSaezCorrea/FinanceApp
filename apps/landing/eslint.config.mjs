import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    files: ["src/**/*.{ts,tsx}", "test/**/*.ts"],
    plugins: { "@typescript-eslint": tseslint, "react-hooks": reactHooks },
    languageOptions: { parser: tsparser },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      ...reactHooks.configs.recommended.rules,
    },
  },
  { ignores: ["dist/**", "node_modules/**", ".astro/**"] },
];
