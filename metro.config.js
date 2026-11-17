const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('glb', 'gltf', 'bin');
if (!config.resolver.sourceExts.includes('cjs')) config.resolver.sourceExts.push('cjs');
if (!config.resolver.sourceExts.includes('mjs')) config.resolver.sourceExts.push('mjs');

module.exports = config;
