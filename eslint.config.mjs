import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";
export default defineConfig([
  ...next,
  ...ts,
  globalIgnores([".next/**", ".data/**"]),
  { rules: { "react-hooks/set-state-in-effect": "off" } },
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: ["@/features/*", "@/app/*", "@/components/*", "@/infrastructure/*", "@/lib/*"],
      }],
    },
  },
  {
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          "@/features/*",
          "@/app/*",
          "@/components/*",
          "@/infrastructure/*",
        ],
        paths: [
          { name: "@/lib/database/db", message: "Core must not depend on infrastructure." },
          { name: "@/lib/database/context", message: "Core must not depend on infrastructure." },
        ],
      }],
    },
  },
]);
