const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const isGitHubPages = process.env.BUILD_TARGET === 'gh-pages';
  const isCustomDomain = process.env.BUILD_TARGET === 'custom-domain';
  
  // Different output paths for different targets
  let outputPath, bundleFilename;
  
  if (isCustomDomain) {
    // For custom domain: explorer at root
    outputPath = path.resolve(__dirname, '..');
    bundleFilename = 'bundle.js';
  } else if (isGitHubPages) {
    // For GitHub Pages: explorer in subdirectory
    outputPath = path.resolve(__dirname, '..');
    bundleFilename = 'explorer/bundle.js';
  } else {
    // For local dev
    outputPath = path.resolve(__dirname, 'dist');
    bundleFilename = 'bundle.js';
  }

  return {
    entry: './app.js',
    output: {
      filename: bundleFilename,
      path: outputPath,
    },
    devServer: {
      static: [
        {
          directory: path.join(__dirname, 'dist'),
        },
        {
          directory: path.join(__dirname, '..'),
          publicPath: '/',
          watch: false
        }
      ],
      port: 8000,
      hot: true,
      open: false
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
        patterns: isCustomDomain ? [
          // For custom domain: files at root
          { from: 'index.html', to: 'index.html' },
          { from: 'styles.css', to: 'styles.css' },
        ] : isGitHubPages ? [
          // For GitHub Pages: copy to explorer subdirectory
          { from: 'index.html', to: 'explorer/index.html' },
          { from: 'styles.css', to: 'explorer/styles.css' },
        ] : [
          // For local dev: copy to dist
          { from: 'index.html', to: 'index.html' },
          { from: 'styles.css', to: 'styles.css' },
        ]
      })
    ]
  };
};