#!/bin/bash

# Build the project
echo "Building project..."
npm run build

# Create deployment directory
echo "Creating deployment directory..."
rm -rf ../../jabberwocky-gh-pages
mkdir -p ../../jabberwocky-gh-pages

# Copy explorer files
echo "Copying explorer files..."
cp -r dist/* ../../jabberwocky-gh-pages/

# Copy runs data (only the needed JSON files)
echo "Copying runs data..."
mkdir -p ../../jabberwocky-gh-pages/runs
cp -r ../runs/* ../../jabberwocky-gh-pages/runs/

echo "Deployment files ready in ../../jabberwocky-gh-pages/"
echo "You can now:"
echo "1. cd ../../jabberwocky-gh-pages"
echo "2. git init"
echo "3. git add ."
echo "4. git commit -m 'Deploy Jabberwocky Explorer'"
echo "5. git branch -M gh-pages"
echo "6. git remote add origin <your-repo-url>"
echo "7. git push -u origin gh-pages"