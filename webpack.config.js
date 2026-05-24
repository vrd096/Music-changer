import path from 'path';
import { fileURLToPath } from 'url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV !== 'production';

/** @param {string} p */
const src = (p) => path.resolve(__dirname, 'src', p);
const dist = (p) => path.resolve(__dirname, 'dist', p);

export default {
  mode: isDev ? 'development' : 'production',
  devtool: isDev ? 'cheap-module-source-map' : false,
  entry: {
    'service-worker': src('background/service-worker.ts'),
    content: src('content/content.ts'),
    'content-dispatcher': src('content/content-dispatcher.ts'),
    'popup/index': src('popup/index.tsx'),
    'sidepanel/index': src('sidepanel/index.tsx'),
    'tabcapture/tabcapture': src('tabcapture/tabcapture.ts'),
    'assets/debug/debug': src('assets/debug/debug.ts'),
  },
  output: {
    path: dist(''),
    filename: '[name].js',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': src(''),
      '@shared': src('shared'),
      '@background': src('background'),
      '@content': src('content'),
      '@popup': src('popup'),
      '@sidepanel': src('sidepanel'),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg|ico)$/,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[name][ext]',
        },
      },
      {
        test: /\.wasm$/,
        type: 'asset/resource',
        generator: {
          filename: '[name][ext]',
        },
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),
    new HtmlWebpackPlugin({
      template: src('popup/index.html'),
      filename: 'popup/index.html',
      chunks: ['popup/index'],
    }),
    new HtmlWebpackPlugin({
      template: src('sidepanel/index.html'),
      filename: 'sidepanel/index.html',
      chunks: ['sidepanel/index'],
    }),
    new HtmlWebpackPlugin({
      template: src('tabcapture/tabcapture.html'),
      filename: 'tabcapture/tabcapture.html',
      chunks: ['tabcapture/tabcapture'],
    }),
    new HtmlWebpackPlugin({
      template: src('assets/debug/debug.html'),
      filename: 'assets/debug/debug.html',
      chunks: ['assets/debug/debug'],
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: src('manifest.json'),
          to: dist('manifest.json'),
        },
        {
          from: src('_locales'),
          to: dist('_locales'),
        },
        {
          from: src('assets/icons'),
          to: dist('assets/icons'),
        },
        {
          from: src('assets/images'),
          to: dist('assets/images'),
        },
        {
          from: src('assets/i18n'),
          to: dist('assets/i18n'),
        },
        {
          from: src('assets/debug/audio-worklet-test.js'),
          to: dist('assets/debug/audio-worklet-test.js'),
        },
        {
          from: src('worklets'),
          to: dist(''),
        },
        {
          from: src('rb.wasm'),
          to: dist('rb.wasm'),
          noErrorOnMissing: true,
        },
        {
          from: path.resolve(__dirname, 'public'),
          to: dist(''),
          noErrorOnMissing: true,
        },
      ],
    }),
  ],
  optimization: {
    splitChunks: {
      cacheGroups: {
        shared: {
          name: 'shared',
          chunks: (chunk) =>
            chunk.name !== 'service-worker' &&
            chunk.name !== 'content' &&
            chunk.name !== 'content-dispatcher',
          minChunks: 2,
          minSize: 0,
        },
      },
    },
  },
};
