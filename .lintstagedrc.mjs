export default {
  'src/**/*.ts': ['prettier --write', 'eslint --fix --max-warnings 0', () => 'tsc --noEmit'],
  'src/**/*.js': ['prettier --write', 'eslint --fix --max-warnings 0'],
  'src/**/*.json': 'prettier --write',
};
