/**
 * Fronteiras de módulo (docs/adr/0005).
 *
 * O repo é único, mas os módulos de domínio em `modules/` não podem se importar
 * por dentro: só pelo índice público. É isto que substitui o custo de um monorepo.
 */
module.exports = {
  forbidden: [
    {
      name: "no-module-internals",
      severity: "error",
      comment:
        "Um módulo só pode ser importado pelo seu índice público (modules/<nome>). " +
        "Importar um arquivo interno de outro módulo acopla os dois pelas entranhas.",
      from: { path: "^modules/([^/]+)/" },
      to: {
        path: "^modules/([^/]+)/.+",
        pathNot: "^modules/$1/",
      },
    },
    {
      name: "no-app-internals",
      severity: "error",
      comment:
        "App Router (Server Components, Server Actions) só enxerga o índice " +
        "público de um módulo, nunca seus arquivos internos.",
      from: { path: "^app/" },
      to: {
        path: "^modules/[^/]+/.+",
        // O índice é a porta de entrada do módulo; o resto é entranha.
        pathNot: "^modules/[^/]+/index\\.ts$",
      },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "Dependência circular entre módulos.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment: "Arquivo que ninguém importa e que não é ponto de entrada.",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$",
          "\\.d\\.ts$",
          "(^|/)tsconfig\\.json$",
          "(^|/)(next|postcss|vitest)\\.config\\.(js|cjs|mjs|ts)$",
          // Convenções do App Router: quem importa é o Next, não o código.
          "^app/.*(layout|page|route|loading|error|not-found)\\.tsx?$",
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.next/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
