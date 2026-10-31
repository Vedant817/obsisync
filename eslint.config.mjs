// Obsidian's community review lints with eslint-plugin-obsidianmd. Running
// the same rules here keeps the release scorecard clean.
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/main.js", "**/*.mjs", "**/*.d.ts", "coverage/**"],
  },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*", "vitest.config.ts", "vitest.setup.ts"],
        },
      },
    },
    rules: {
      // "Sealed Sync" is the plugin's name; "Obsidian Sync" is the product it is compared with.
      "obsidianmd/ui/sentence-case": [
        "warn",
        { brands: ["Sealed Sync", "Obsidian Sync", "Obsidian"], acronyms: ["QR", "ID", "API", "HTTPS"], ignoreWords: ["cursor"] },
      ],
    },
  },
]);
