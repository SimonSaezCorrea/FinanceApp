import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

// Plain TypeScript and one Node script: only the TypeScript rules.
export default [
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
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
