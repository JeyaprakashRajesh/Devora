# Linux Development Dependencies

To contribute to the Devora platform on a Linux environment, you need to install the following dependencies. These tools are required to run the monorepo, build the Rust deployment engine, and spin up the Docker Compose dev infrastructure.

## 1. System Requirements & Build Tools
Ensure your system is up-to-date and has the basic build utilities essential for compiling native npm modules and Rust projects.

```bash
sudo apt update
sudo apt install build-essential curl git libssl-dev pkg-config
```

## 2. Git
Usually pre-installed, but you can install/update it:
```bash
sudo apt install git
```

## 3. Node.js 20 LTS & npm
We recommend using **nvm (Node Version Manager)** to manage Node.js versions.

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Load nvm (or simply restart terminal)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js 20 LTS
nvm install 20
nvm use 20
```

## 4. Rust 1.78+
Rust is required to work on the `deploy-engine` and `installer` in the `core/` directory.

```bash
# Install Rust via rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Source the env (or restart terminal)
source $HOME/.cargo/env

# Verify installation
rustc --version
```

## 5. Docker Engine & Docker Compose
Docker is required for spinning up the local development infrastructure (PostgreSQL, NATS, etc.).

Install Docker Engine based on your distribution (e.g., Ubuntu):
```bash
# Set up the repository
sudo apt-get update
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update

# Install Docker Engine and Compose
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```
*Note: Ensure your user is added to the `docker` group so you can run Docker without `sudo`.*
```bash
sudo usermod -aG docker $USER
```
*(You may need to log out and log back in for this to take effect.)*
