#!/bin/bash
set -e  # Exit on error

echo "🧹 Cleaning previous build..."
rm -rf dist
mkdir -p dist

cd ghcgtw

echo "🧹 Cleaning extension build artifacts..."
rm -rf out node_modules *.vsix

echo "📦 Installing dependencies..."
npm install

echo "🔨 Compiling TypeScript..."
npm run compile

echo "📦 Packaging extension..."
npx @vscode/vsce package --out ../dist/

cd ..

VSIX_FILE=$(ls -t dist/*.vsix | head -1)

echo ""
echo "✅ Build complete!"
echo "📦 Extension package: $VSIX_FILE"
echo ""
echo "To install globally in VS Code, run:"
echo "  code --install-extension \"$VSIX_FILE\""
echo ""

read -p "Install extension now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Find code command (handle macOS without code in PATH)
    if command -v code &> /dev/null; then
        CODE_CMD="code"
    elif [[ -f "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]]; then
        CODE_CMD="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
    else
        echo "⚠️  'code' command not found. To add it to PATH:"
        echo "   1. Open VS Code"
        echo "   2. Press Cmd+Shift+P"
        echo "   3. Run: Shell Command: Install 'code' command in PATH"
        echo ""
        echo "ℹ️  Alternatively, install manually via VS Code:"
        echo "   Extensions: Install from VSIX... → Select $VSIX_FILE"
        exit 0
    fi
    
    # Extract extension ID from package.json
    EXTENSION_ID=$(node -pe "const pkg = require('./ghcgtw/package.json'); \`\${pkg.publisher}.\${pkg.name}\`")
    
    # Check if extension is already installed
    if "$CODE_CMD" --list-extensions | grep -q "^${EXTENSION_ID}\$"; then
        echo "🔄 Uninstalling previous version..."
        "$CODE_CMD" --uninstall-extension "$EXTENSION_ID"
        sleep 1  # Give VS Code time to clean up
    fi
    
    echo "🚀 Installing extension..."
    "$CODE_CMD" --install-extension "$VSIX_FILE"
    echo ""
    echo "✅ Extension installed! Restart VS Code or reload window to activate."
    echo "   The extension will now run in all VS Code instances."
else
    echo "ℹ️  To install manually, use VS Code command palette:"
    echo "   Extensions: Install from VSIX... → Select $VSIX_FILE"
fi
