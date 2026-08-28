import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Database Router: component/page/hook chỉ được truy cập dữ liệu qua
    // `@/services/database` (Database.*) hoặc `@/lib/supabase` (đã định tuyến).
    files: ["src/components/**/*.{ts,tsx}", "src/pages/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/supabase-js",
              importNames: ["createClient"],
              message:
                "Không tạo Supabase client trong component. Dùng Database.* từ @/services/database.",
            },
            {
              name: "@/integrations/supabase/client",
              message: "Dùng `supabase` từ @/lib/supabase hoặc Database.* từ @/services/database.",
            },
            {
              name: "@/integrations/supabase/logs-client",
              message: "Dùng Database.* / socialDb() từ @/services/database thay cho db3().",
            },
            {
              name: "@/integrations/supabase/secondary-client",
              message: "Dùng Database.upload / storageDb() từ @/services/database thay cho db2().",
            },
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
