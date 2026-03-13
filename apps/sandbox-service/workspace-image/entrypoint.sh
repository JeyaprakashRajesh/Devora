#!/bin/bash
# Starts both code-server and the AI agent sidecar

set -e

cleanup() {
  kill "$AGENT_PID" "$CODE_SERVER_PID" 2>/dev/null || true
}

trap cleanup EXIT TERM INT

echo "[devora] Starting AI agent on port 9090..."
node /opt/devora-agent/dist/index.js &
AGENT_PID=$!

echo "[devora] Starting code-server on port 8080..."
code-server \
  --bind-addr 0.0.0.0:8080 \
  --auth none \
  --disable-telemetry \
  /workspace &
CODE_SERVER_PID=$!

# If either process dies, kill the other and exit
wait -n "$AGENT_PID" "$CODE_SERVER_PID"
EXIT_CODE=$?

echo "[devora] A process exited with code $EXIT_CODE - shutting down"
exit $EXIT_CODE
