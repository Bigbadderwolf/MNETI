const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro config for MNETI mobile app.
 * Adds crypto/buffer polyfills required by @solana/web3.js and snarkjs.
 */
const config = {
  resolver: {
    extraNodeModules: {
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('readable-stream'),
      buffer: require.resolve('buffer'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
