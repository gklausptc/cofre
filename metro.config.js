const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Drizzle grava migrations como .sql e as importa como texto bruto (expo-sqlite driver).
config.resolver.sourceExts.push('sql');

module.exports = withNativeWind(config, { input: './src/core/theme/global.css' });
