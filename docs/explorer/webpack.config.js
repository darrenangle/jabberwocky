const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const isCustomDomain = process.env.BUILD_TARGET === 'custom-domain';
  // Default to a single consistent target that serves under /explorer/
  
  // Different output paths for different targets
  let outputPath, bundleFilename, publicPath;

  if (isCustomDomain) {
    // Custom domain: explorer is served at root
    outputPath = path.resolve(__dirname, '..');
    bundleFilename = 'bundle.js';
    publicPath = 'auto';
  } else {
    // Unified default: GitHub Pages style — explorer under /explorer/
    outputPath = path.resolve(__dirname, '..');
    bundleFilename = 'explorer/bundle.js';
    publicPath = 'auto';
  }

  return {
    entry: './app.js',
    output: {
      filename: bundleFilename,
      path: outputPath,
      publicPath,
    },
    devServer: {
      static: [
        // Serve the docs root and explorer subdir for local browsing at /explorer/
        { directory: path.join(__dirname, '..'), publicPath: '/', watch: false },
      ],
      port: 8000,
      hot: true,
      open: ['/explorer/'],
      historyApiFallback: {
        index: '/explorer/index.html'
      }
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-react']
            }
          }
        }
      ]
    },
    resolve: {
      extensions: ['.js', '.jsx']
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: isCustomDomain
          ? [
              { from: 'index.html', to: 'index.html' },
              { from: 'styles.css', to: 'styles.css' },
            ]
          : [
              // Unified: copy under explorer/ consistently
              { from: 'index.html', to: 'explorer/index.html' },
              { from: 'styles.css', to: 'explorer/styles.css' },
            ],
      }),
    ],
  };
};
