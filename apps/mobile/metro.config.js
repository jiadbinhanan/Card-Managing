const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);


// 1. Watch all files within the monorepo
config.watchFolders = [monorepoRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Explicit polyfills resolver fallback for pnpm monorepo isolation
const polyfillsPath = path.resolve(projectRoot, 'node_modules/@react-native/js-polyfills');
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@react-native/js-polyfills': polyfillsPath,
};

module.exports = config;
