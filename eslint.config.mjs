import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
}, {
  files: ['**/*.ts'],
  rules: {
    'complexity': ['error', 10],
    'antfu/if-newline': 'off',
    'no-console': 'off',
    'test/prefer-lowercase-title': 'off',
    'ts/explicit-function-return-type': 'off',
    'ts/method-signature-style': 'off',
    'ts/no-namespace': 'off',
    'unused-imports/no-unused-vars': ['error', { args: 'none' }],
  },
})
