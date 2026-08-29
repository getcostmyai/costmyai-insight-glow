// CI-only ESLint config: isolates the costmyai/require-is-synthetic-on-guarded-insert
// rule so the "Lint - guarded-table is_synthetic check" workflow gates ONLY on
// that rule, not on the full project lint surface (prettier formatting,
// no-explicit-any, react-hooks, etc. — 5,700+ pre-existing, unrelated issues
// tracked separately, not this workflow's job to enforce).
//
// @typescript-eslint and react-hooks are registered here (plugins only, no rules
// enabled from them) purely so ESLint can resolve the plugin-rule names referenced
// in existing inline `// eslint-disable-next-line <rule>` comments across the
// codebase. Without registering the plugin, ESLint treats those comments as
// referencing an unknown rule and hard-errors ("Definition for rule 'X' was not
// found") even though the rule itself is never turned on here. Core (no-plugin)
// rule names like no-console/no-control-regex/prefer-rest-params resolve on their
// own and need no registration.
//
// Do not point CI at eslint.config.js for this workflow; that file intentionally
// runs the full project lint set for local dev / `npm run lint`.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import requireIsSyntheticOnGuardedInsert from "./eslint-rules/require-is-synthetic-on-guarded-insert.js";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parser: tseslint.parser,
    },
    linterOptions: {
      // This config only loads @typescript-eslint/react-hooks as plugins (for
      // disable-comment resolution, see note above) without enabling any of
      // their rules, and doesn't load no-console/no-control-regex/prefer-rest-params
      // at all. Reporting those pre-existing disable comments as "unused" in this
      // narrow, single-purpose run would be noise unrelated to what this workflow
      // checks — suppressed here, not suppressed in the full `npm run lint`.
      reportUnusedDisableDirectives: false,
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
      costmyai: {
        rules: {
          "require-is-synthetic-on-guarded-insert": requireIsSyntheticOnGuardedInsert,
        },
      },
    },
    rules: {
      "costmyai/require-is-synthetic-on-guarded-insert": "warn",
    },
  },
);
