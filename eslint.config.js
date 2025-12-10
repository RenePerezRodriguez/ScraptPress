const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
    {
        ignores: ['dist/**', 'node_modules/**'],
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir: __dirname,
            },
            globals: {
                // Basic node globals
                process: 'readonly',
                console: 'readonly',
                module: 'readonly',
                require: 'readonly',
                __dirname: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            prettier: prettierPlugin,
        },
        rules: {
            // TypeScript recommended rules
            ...tsPlugin.configs.recommended.rules,

            // Prettier config (disables conflicting rules)
            ...prettierConfig.rules,

            // Enable Prettier formatting validation
            'prettier/prettier': ['error', { endOfLine: 'auto' }],

            // Project specific overrides
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
        },
    },
];
