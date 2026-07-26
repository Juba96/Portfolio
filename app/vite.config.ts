import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import {
  higgsfieldDesignInspectorVitePlugin,
  higgsfieldDesignSourceBabelPlugin,
} from "./src/module/design-inspector/vite";
import svgr from "vite-plugin-svgr";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

// The vendored @higgsfield/quanta components import their glyphs from the private
// Nexus-only `@higgsfield-ai/icons`. Generated sites build on the PUBLIC npm
// registry, so we redirect every `@higgsfield-ai/icons/*` import to a Material
// Symbols shim instead (see src/lib/quanta-material-icons.ts). tsconfig.json has
// the matching `paths` entry so type-checking resolves it too.
const QUANTA_ICONS_SHIM = fileURLToPath(
  new URL("./src/lib/quanta-material-icons.ts", import.meta.url),
);

export default defineConfig(({ mode, command }) => {
  const designInspectorEnabled = process.env.HF_DESIGN_INSPECTOR === "1" || mode === "design";

  return {
    resolve: {
      alias: [
        { find: /^@higgsfield-ai\/icons(\/.*)?$/, replacement: QUANTA_ICONS_SHIM },
        // '@' also resolves via vite-tsconfig-paths; kept here for lightswind.
        { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      ],
    },
    // Production SSR bundle is self-contained (no node_modules at runtime) —
    // Vite's default SSR build leaves npm deps as bare external imports (h3,
    // react, @tanstack/*, seroval, …). Bundle them all in. Build-only: in dev,
    // noExternal makes Vite's module runner inline React's CJS build, which
    // throws "module is not defined".
    // (node: builtins stay external — Bun/Node provide them at runtime.)
    ssr: {
      noExternal: command === "build" ? true : undefined,
      // `cloudflare:workers` is a workerd runtime built-in. It is only imported
      // by the unused D1 example (src/lib/api/example.functions.ts); keep it
      // external so it never gets resolved at build time.
      // `@node-rs/argon2` ships a native .node binary rollup can't parse; it's
      // the Node-only fallback for password hashing (prod runs Bun's built-in),
      // so leave it to be resolved from node_modules at runtime.
      external: ["cloudflare:workers", "@node-rs/argon2"],
    },
    build: {
      // Keep `cloudflare:*` external in the SSR rollup pass too — `noExternal`
      // above would otherwise try to resolve+bundle it and fail.
      rollupOptions: { external: [/^cloudflare:/, /^@node-rs\/argon2/] },
    },
    plugins: [
      // Material Symbols SVGs (the app icon set) import as React components via
      // `?react`. `icon: true` sizes them 1em; fill is forced to currentColor so
      // they color like text (the raw SVGs have no fill attribute). Keep the
      // viewBox so CSS sizing scales the glyph.
      svgr({
        svgrOptions: {
          icon: true,
          svgProps: { fill: "currentColor" },
          svgoConfig: {
            plugins: [
              { name: "preset-default", params: { overrides: { removeViewBox: false } } },
            ],
          },
        },
      }),
      // TanStack Start plugin must run before React's plugin.
      //
      // SSR build: `vite build` emits a Workers-shaped server bundle
      // (dist/server/server.js — `export default { fetch }`) plus dist/client
      // (hashed static assets). The platform publishes that as a per-tenant
      // Worker on Workers for Platforms, served at <sub>.higgsfield.app/ (host
      // root, so Vite's default base "/" — no base-path juggling).
      //
      // Rendering happens on the server per request, so site code must be
      // SSR-safe: never touch browser-only globals (window, document,
      // localStorage, navigator) during render or at module top level — only
      // inside effects/handlers, or guarded with `typeof window !== "undefined"`.
      tanstackStart({
        server: { entry: "server" },
      }),
      higgsfieldDesignInspectorVitePlugin(designInspectorEnabled),
      react({
        babel: {
          plugins: designInspectorEnabled ? [higgsfieldDesignSourceBabelPlugin] : [],
        },
      }),
      tailwindcss(),
      tsconfigPaths(),
    ],
  };
});
