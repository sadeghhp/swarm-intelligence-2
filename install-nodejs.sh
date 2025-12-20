#!/bin/bash

# Script Version: 1.0.0
# Description: Install latest version of Node.js and npm on Ubuntu/Debian systems
# Usage: ./install-nodejs.sh

set -e  # Exit on error

VERSION="1.0.0"
SCRIPT_NAME="install-nodejs.sh"

echo "=========================================="
echo "Node.js and npm Installation Script"
echo "Version: $VERSION"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "Error: Please do not run this script as root/sudo."
   echo "The script will prompt for sudo when needed."
   exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    OS_VERSION=$VERSION_ID
else
    echo "Error: Cannot detect OS. This script supports Ubuntu/Debian systems."
    exit 1
fi

echo "Detected OS: $OS $OS_VERSION"
echo ""

# Check if Node.js is already installed
if command -v node &> /dev/null; then
    CURRENT_NODE_VERSION=$(node --version)
    echo "Node.js is already installed: $CURRENT_NODE_VERSION"
    read -p "Do you want to reinstall/upgrade? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 0
    fi
fi

# Check if npm is already installed
if command -v npm &> /dev/null; then
    CURRENT_NPM_VERSION=$(npm --version)
    echo "npm is already installed: $CURRENT_NPM_VERSION"
fi

echo ""
echo "This script will:"
echo "  1. Install required dependencies (curl, gnupg, ca-certificates)"
echo "  2. Add NodeSource repository for latest Node.js LTS"
echo "  3. Install Node.js and npm"
echo "  4. Verify the installation"
echo ""
read -p "Do you want to continue? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Installation cancelled."
    exit 0
fi

echo ""
echo "Step 1: Installing required dependencies..."
sudo apt-get update
sudo apt-get install -y curl gnupg ca-certificates

echo ""
echo "Step 2: Adding NodeSource repository..."
# Get the latest LTS version number
NODE_MAJOR_VERSION="20"  # Current LTS major version
curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR_VERSION}.x | sudo -E bash -

echo ""
echo "Step 3: Installing Node.js and npm..."
sudo apt-get install -y nodejs

echo ""
echo "Step 4: Verifying installation..."
if command -v node &> /dev/null; then
    INSTALLED_NODE_VERSION=$(node --version)
    echo "✓ Node.js installed successfully: $INSTALLED_NODE_VERSION"
else
    echo "✗ Error: Node.js installation failed"
    exit 1
fi

if command -v npm &> /dev/null; then
    INSTALLED_NPM_VERSION=$(npm --version)
    echo "✓ npm installed successfully: $INSTALLED_NPM_VERSION"
else
    echo "✗ Error: npm installation failed"
    exit 1
fi

echo ""
echo "Step 5: Updating npm to latest version..."
sudo npm install -g npm@latest
UPDATED_NPM_VERSION=$(npm --version)
echo "✓ npm updated to: $UPDATED_NPM_VERSION"

echo ""
echo "=========================================="
echo "Installation completed successfully!"
echo "=========================================="
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo ""
echo "You can now use 'node' and 'npm' commands."
echo ""

