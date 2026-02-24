module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module-resolver', {
        root: ['./'],          // The root of your project
        alias: {
          '@': './',           // @/ maps to the project root
        },
      }],
      'react-native-reanimated/plugin', // ← must stay LAST
    ],
  };
};