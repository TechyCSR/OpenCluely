const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "bin/**",
      ".venv-whisper/**", // Python venv, vendored JS inside site-packages isn't ours
      "lib/**", // vendored third-party scripts (markdown.js, mathrender.js)
      "webapp/**", // static marketing site, separate concern
      "**/*.min.js",
    ],
  },
  js.configs.recommended,
  // Root-level Node config files
  {
    files: ["eslint.config.js", "tailwind.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },
  // Electron main process, preload, and Node-side modules (CommonJS)
  {
    files: [
      "main.js",
      "preload.js",
      "prompt-loader.js",
      "speech-recognition.js",
      "src/core/**/*.js",
      "src/managers/**/*.js",
      "src/services/**/*.js",
      "scripts/**/*.js",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
  // Renderer / browser scripts loaded via <script> tags in the HTML windows
  {
    files: ["src/ui/**/*.js", "onboarding.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        // These renderer scripts defensively feature-detect a Node/CJS
        // context (typeof require !== 'undefined') and a markdown.js
        // <script>-tag global, falling back gracefully when absent.
        require: "readonly",
        markdown: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
];
