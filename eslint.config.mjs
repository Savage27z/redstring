import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Flat config, built from the plugins directly.
 *
 * The FlatCompat bridge to the legacy `next/core-web-vitals` shareable config
 * throws on ESLint 9 ("Converting circular structure to JSON") — and `next lint`
 * swallows that and exits 0, so lint silently checked nothing at all.
 */
export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,mjs}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
      // Unused args are usually deliberate in callbacks; a leading _ opts out.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // react-hooks/immutability forbids mutating anything a hook returned. That
    // is exactly how react-three-fiber works: `useFrame` mutates the camera and
    // mesh objects `useThree`/refs hand back, sixty times a second, by design.
    // Enforcing it here would mean rewriting the renderer, not fixing a bug.
    files: ['src/components/three/**'],
    rules: { 'react-hooks/immutability': 'off' },
  },

  // Node scripts and the layout test run outside the bundler.
  {
    files: ['scripts/**/*.mjs', 'scatter.test.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
);
