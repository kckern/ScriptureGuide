const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    linker: './linker.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            compact: true,
            minified: true
          }
        }
      }
    ]
  },
  optimization: {
    minimize: true,
    usedExports: true,
    sideEffects: false
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'background.js', to: 'background.js', noErrorOnMissing: false },
        { from: 'icons/*.png', to: 'icons/[name][ext]' },
        { from: 'fonts', to: 'fonts' }
      ],
    }),
  ],
  resolve: {
    fallback: {
      "path": false,
      "fs": false
    }
  }
};
