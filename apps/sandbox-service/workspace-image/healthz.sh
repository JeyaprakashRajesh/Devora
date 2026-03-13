#!/bin/bash
# Called by K8s readinessProbe and livenessProbe on GET /healthz port 8080
# code-server serves this path natively - just check it responds

set -e

response=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:8080/healthz 2>/dev/null || echo "000")

if [ "$response" = "200" ] || [ "$response" = "302" ]; then
  exit 0
else
  exit 1
fi
