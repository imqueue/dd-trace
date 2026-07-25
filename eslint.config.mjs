import typescriptEslint from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

export default [
    {
        // Compiled output sits next to its sources, so it has to be excluded
        // explicitly — otherwise every file gets linted twice, once as
        // TypeScript and once as the JavaScript it was compiled to.
        ignores: [
            '**/*.js',
            '**/*.d.ts',
            'coverage/**',
            'docs/**',
            '.nyc_output/**',
        ],
    },
    ...compat.extends(
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
    ),
    {
        plugins: {
            '@typescript-eslint': typescriptEslint,
        },

        languageOptions: {
            globals: {
                ...globals.node,
            },

            parser: tsParser,
        },

        rules: {
            'max-len': ['error', {
                code: 80,
            }],

            'new-parens': 'error',
            'no-caller': 'error',
            'no-cond-assign': ['error', 'always'],
            'no-multiple-empty-lines': 'off',

            quotes: ['error', 'single', {
                avoidEscape: true,
            }],

            'arrow-parens': 'off',
            'no-bitwise': 'off',
            'sort-keys': 'off',
            'no-console': 'off',
            'max-classes-per-file': 'off',
            'no-unused-expressions': 'off',
            '@typescript-eslint/interface-name-prefix': 'off',
            'comma-dangle': ['error', 'always-multiline'],
            '@typescript-eslint/no-namespace': 'off',
            '@typescript-eslint/no-extraneous-class': 'off',
            // This package exists to bridge dd-trace's untyped internals with
            // @imqueue/rpc, and dd-trace's own public typings use `any` for
            // spans, scopes and plugin configuration. Requiring a narrower type
            // here would mean inventing declarations for someone else's private
            // API, so the rule is off rather than silenced case by case.
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
    {
        // Specs run under mocha, whose BDD globals are injected by the runner.
        files: ['test/**/*.ts'],

        languageOptions: {
            globals: {
                ...globals.mocha,
            },
        },
    },
];
