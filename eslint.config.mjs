import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Prettier owns layout; ESLint keeps the one line-length cap Prettier
  // cannot guarantee on its own (long comments, JSX text, identifiers).
  prettier,
  {
    rules: {
      "max-len": [
        "error",
        {
          code: 80,
          tabWidth: 2,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
          // Directive comments must stay on one line to keep working.
          ignorePattern: "eslint-disable",
        },
      ],
    },
  },
  globalIgnores([
    ".claude/**",
    ".server-guy/**",
    ".next/**",
    "node_modules/**",
    "coverage/**",
    "tests/results/**",
    "next-env.d.ts",
  ]),
]);
