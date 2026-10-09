import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

// Plain TypeScript (no React components here): only the TypeScript rules. The React plugins
// belong to the packages that render something (`@finance/ui`, the apps).
export default [
  {
    files: ["src/**/*.ts"],
    plugins: { "@typescript-eslint": tseslint },
    languageOptions: { parser: tsparser },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  { ignores: ["dist/**", "node_modules/**"] },
];
