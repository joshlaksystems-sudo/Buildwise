#!/usr/bin/env bash
set -euo pipefail
backend_url="${1:?backend URL required}"
frontend_url="${2:?frontend URL required}"
vercel_bypass_secret="${3:-${VERCEL_AUTOMATION_BYPASS_SECRET:-}}"
curl_args=(--silent --show-error --location --retry 3 --max-time 30)
if [ -n "$vercel_bypass_secret" ]; then
	curl_args+=(-H "x-vercel-protection-bypass: ${vercel_bypass_secret}")
fi

request_json() {
	local url="$1"
	local response_file headers_file status content_type
	response_file="$(mktemp)"
	headers_file="$(mktemp)"
	trap 'rm -f "$response_file" "$headers_file"' RETURN
	status="$(curl "${curl_args[@]}" -D "$headers_file" -o "$response_file" -w '%{http_code}' "$url")"
	content_type="$(awk 'BEGIN {IGNORECASE=1} /^content-type:/ {sub(/^[^:]*:[[:space:]]*/, ""); print; exit}' "$headers_file" | tr -d '\r')"
	if [ "$status" != "200" ]; then
		echo "Smoke check expected HTTP 200 but received HTTP $status ($content_type) from $url" >&2
		head -c 1000 "$response_file" >&2
		return 1
	fi
	if ! jq -e . "$response_file" >/dev/null 2>&1; then
		echo "Smoke check expected a JSON body but received ($content_type) from $url" >&2
		head -c 1000 "$response_file" >&2
		return 1
	fi
	cat "$response_file"
}

health="$(request_json "${backend_url%/}/health")"
printf '%s' "$health" | jq -e '.ok == true' >/dev/null
ready="$(request_json "${backend_url%/}/health/ready")"
printf '%s' "$ready" | jq -e '.ok == true' >/dev/null
curl "${curl_args[@]}" --fail "${frontend_url%/}/" | grep -Eiq 'root|YardLogic'
echo "IBim/YardLogic smoke checks passed."
