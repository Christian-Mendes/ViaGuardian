const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */

const defaultConfig = getDefaultConfig(__dirname);

const customConfig = {
  resolver: {
    // Adicionamos as extensões necessárias para empacotar os modelos matemáticos e rótulos da IA
    assetExts: [...defaultConfig.resolver.assetExts, 'bin', 'txt', 'tflite'],
  },
};

module.exports = mergeConfig(defaultConfig, customConfig);