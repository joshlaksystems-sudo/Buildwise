#!/usr/bin/env bash
set -euo pipefail
backend_url="${1:?backend URL required}"
frontend_url="${2:?frontend URL required}"

health="$(curl --fail --silent --show-error --retry 3 --max-time 30 "${backend_url%/}/health")"
printf '%s' "$health" | jq -e '.ok == true' >/dev/null
ready="$(curl --fail --silent --show-error --retry 3 --max-time 30 "${backend_url%/}/health/ready")"
printf '%s' "$ready" | jq -e '.ok == true' >/dev/null
curl --fail --silent --show-error --retry 3 --max-time 30 "${frontend_url%/}/" | grep -Eiq 'root|YardLogic'
echo "IBim/YardLogic smoke checks passed."
