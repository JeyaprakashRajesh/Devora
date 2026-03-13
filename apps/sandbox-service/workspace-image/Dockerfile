FROM codercom/code-server:4.20.0

USER root

# Install system packages
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    unzip \
    build-essential \
    python3 \
    python3-pip \
    jq \
    ripgrep \
    fd-find \
    htop \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 LTS via nvm
ENV NVM_DIR=/usr/local/nvm
ENV NODE_VERSION=20.11.0
RUN mkdir -p $NVM_DIR && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && \
    . $NVM_DIR/nvm.sh && \
    nvm install $NODE_VERSION && \
    nvm alias default $NODE_VERSION && \
    nvm use default
ENV PATH=$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

# Install Rust via rustup
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --default-toolchain stable --profile minimal
ENV PATH=/root/.cargo/bin:$PATH

# Install global Node.js tools
RUN npm install -g \
    typescript \
    tsx \
    prettier \
    eslint \
    @antfu/ni

# Copy and build AI agent
COPY ai-agent/ /opt/devora-agent/
WORKDIR /opt/devora-agent
RUN npm install && npm run build

# Copy startup scripts
COPY healthz.sh /usr/local/bin/healthz
COPY entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/healthz /usr/local/bin/entrypoint

# code-server config directory
RUN mkdir -p /home/coder/.config/code-server && \
    chown -R coder:coder /home/coder

COPY config.yaml /home/coder/.config/code-server/config.yaml

# Workspace directory - will be mounted from PVC
RUN mkdir -p /workspace && chown coder:coder /workspace

USER coder

WORKDIR /workspace

EXPOSE 8080
EXPOSE 9090

ENTRYPOINT ["/usr/local/bin/entrypoint"]
