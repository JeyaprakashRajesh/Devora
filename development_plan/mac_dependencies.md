# macOS Development Dependencies

To contribute to the Devora platform on a macOS environment, you need to install the following dependencies. 

## 1. Homebrew
The missing package manager for macOS. It makes installing other dependencies much easier.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

## 2. Git & Build Tools
Required for building native extensions and compiling C/C++ libraries used by Rust and some Node.js modules.

```bash
xcode-select --install
```
If you prefer standard Git, you can also install it via Homebrew:
```bash
brew install git
```

## 3. Node.js 20 LTS & npm
We recommend using **nvm (Node Version Manager)**.

```bash
# Install nvm
brew install nvm

# Set up nvm in your shell profile (e.g., ~/.zshrc)
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"

# Install Node.js 20 LTS
nvm install 20
nvm use 20
```

## 4. Rust 1.78+
Rust is required to work on the `deploy-engine` and `installer` in the `core/` directory.

```bash
# Install Rust via rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Source the env (or restart your terminal)
source $HOME/.cargo/env

# Verify installation
rustc --version
```

## 5. Docker Desktop
Docker is required for spinning up the local development infrastructure (PostgreSQL, NATS, etc.).

```bash
brew install --cask docker
```
*After installation, open the **Docker Desktop** app to start the Docker daemon and accept the terms.*
