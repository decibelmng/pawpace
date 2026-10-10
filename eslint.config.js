// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'supabase/functions/*'],
  },
  {
    rules: {
      // Plain apostrophes in UI copy are fine in React Native <Text>.
      'react/no-unescaped-entities': 'off',
      // Screens load data in effects and set state when it arrives; that is intended.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
