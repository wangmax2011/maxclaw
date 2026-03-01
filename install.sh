#!/usr/bin/env bash
# MaxClaw Installation Script
# Installs MaxClaw CLI tool globally

set -e

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🐾 MaxClaw Installation Script"
echo "=============================="
echo ""

# Check Node.js version
echo "Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "   Please install Node.js 20+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ is required. Current version: $(node -v)"
    echo "   Please upgrade Node.js from https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js $(node -v) installed"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    echo "   npm is installed together with Node.js"
    exit 1
fi

echo "✓ npm $(npm -v) installed"
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install --production

echo "✓ Dependencies installed"
echo ""

# Build
echo "Building MaxClaw..."
npm run build

echo "✓ Build completed"
echo ""

# Global link
echo "Installing MaxClaw globally..."
npm link

echo "✓ MaxClaw installed globally"
echo ""

# Verify installation
echo "Verifying installation..."
if command -v maxclaw &> /dev/null; then
    MAXCLAW_VERSION=$(maxclaw --version 2>&1 | head -1)
    echo "✓ MaxClaw command available: $MAXCLAW_VERSION"
else
    echo "⚠️  MaxClaw command not found in PATH"
    echo ""
    echo "You may need to add npm global bin directory to your PATH:"
    echo ""
    echo "  For bash/zsh:"
    echo "    export PATH=\"\$(npm config get prefix)/bin:\$PATH\""
    echo ""
    echo "  Add the above line to your ~/.bashrc or ~/.zshrc"
    echo ""
fi

echo ""
echo "=============================="
echo "🎉 Installation complete!"
echo ""
echo "Quick start:"
echo "  maxclaw --help           # Show available commands"
echo "  maxclaw discover         # Discover projects"
echo "  maxclaw dashboard        # Open web dashboard"
echo "  maxclaw skill list       # List available skills"
echo ""
echo "Documentation: https://github.com/wangmax2011/maxclaw#readme"
echo ""
