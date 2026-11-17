const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const threeBuild = path.resolve(__dirname, 'node_modules/three/build/three.cjs');

config.resolver.assetExts.push('glb', 'gltf', 'bin');
if (!config.resolver.sourceExts.includes('cjs')) config.resolver.sourceExts.push('cjs');
if (!config.resolver.sourceExts.includes('mjs')) config.resolver.sourceExts.push('mjs');

const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // The app imports the ESM build and React Three Fiber requires the CJS build.
  // Those are two copies of Three.js, which warns and can break materials.
  if (moduleName === 'three') {
    return { type: 'sourceFile', filePath: threeBuild };
  }
  if (typeof resolveRequest === 'function') return resolveRequest(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
