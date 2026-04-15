#!/usr/bin/env bash
set -euo pipefail

API_BASE="https://api.render.com/v1"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_env() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required environment variable: $key" >&2
    exit 1
  fi
}

api_get() {
  local path="$1"
  curl -fsSL "$API_BASE$path" \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Accept: application/json"
}

api_post() {
  local path="$1"
  local payload="$2"
  curl -fsSL "$API_BASE$path" \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -X POST \
    -d "$payload"
}

pick_owner_id() {
  if [[ -n "${RENDER_OWNER_ID:-}" ]]; then
    echo "$RENDER_OWNER_ID"
    return
  fi

  local owners_json
  owners_json="$(api_get '/owners?limit=100')"

  local selected_owner_id=""

  if [[ -n "${RENDER_WORKSPACE_EMAIL:-}" ]]; then
    selected_owner_id="$(jq -r --arg email "$RENDER_WORKSPACE_EMAIL" 'first(.[]? | select(.owner.email == $email) | .owner.id) // empty' <<<"$owners_json")"
  fi

  if [[ -z "$selected_owner_id" && -n "${RENDER_WORKSPACE_NAME:-}" ]]; then
    selected_owner_id="$(jq -r --arg name "$RENDER_WORKSPACE_NAME" 'first(.[]? | select(.owner.name == $name) | .owner.id) // empty' <<<"$owners_json")"
  fi

  if [[ -z "$selected_owner_id" ]]; then
    selected_owner_id="$(jq -r 'first(.[]?.owner.id) // empty' <<<"$owners_json")"
  fi

  if [[ -z "$selected_owner_id" ]]; then
    echo "No Render workspace found for this API key." >&2
    exit 1
  fi

  echo "$selected_owner_id"
}

main() {
  require_cmd curl
  require_cmd jq
  require_env RENDER_API_KEY
  require_env RENDER_REPO_URL

  local service_name="${RENDER_SERVICE_NAME:-futureeapro-web}"
  local branch="${RENDER_BRANCH:-main}"
  local plan="${RENDER_PLAN:-free}"
  local region="${RENDER_REGION:-oregon}"
  local runtime="${RENDER_RUNTIME:-node}"
  local auto_deploy="${RENDER_AUTO_DEPLOY:-yes}"
  local root_dir="${RENDER_ROOT_DIR:-}"
  local health_check_path="${RENDER_HEALTH_CHECK_PATH:-/}"
  local build_command="${RENDER_BUILD_COMMAND:-npm install}"
  local start_command="${RENDER_START_COMMAND:-npm start}"
  local session_secret="${SESSION_SECRET:-$(openssl rand -hex 32)}"
  local superhost_email="${SUPERHOST_EMAIL:-superhost@futureeapro.com}"
  local superhost_password="${SUPERHOST_PASSWORD:-ChangeMe123!}"
  local client_bypass_emails="${CLIENT_BYPASS_EMAILS:-nhlanhlamashapa11@gmail,nhlanhlamashapa11@gmail.com}"

  local owner_id
  owner_id="$(pick_owner_id)"

  local existing_json
  existing_json="$(api_get "/services?ownerId=$owner_id&type=web_service&name=$service_name&limit=20")"

  local service_id
  service_id="$(jq -r --arg name "$service_name" 'first(.[]? | select(.service.name == $name) | .service.id) // empty' <<<"$existing_json")"

  local service_url

  if [[ -n "$service_id" ]]; then
    service_url="$(jq -r --arg sid "$service_id" 'first(.[]? | select(.service.id == $sid) | .service.serviceDetails.url) // empty' <<<"$existing_json")"
    echo "Render service already exists: $service_id"
  else
    local payload
    payload="$({
      jq -n \
        --arg type "web_service" \
        --arg name "$service_name" \
        --arg ownerId "$owner_id" \
        --arg repo "$RENDER_REPO_URL" \
        --arg branch "$branch" \
        --arg autoDeploy "$auto_deploy" \
        --arg rootDir "$root_dir" \
        --arg runtime "$runtime" \
        --arg plan "$plan" \
        --arg region "$region" \
        --arg healthCheckPath "$health_check_path" \
        --arg buildCommand "$build_command" \
        --arg startCommand "$start_command" \
        --arg sessionSecret "$session_secret" \
        --arg superhostEmail "$superhost_email" \
        --arg superhostPassword "$superhost_password" \
        --arg clientBypassEmails "$client_bypass_emails" \
        '
          {
            type: $type,
            name: $name,
            ownerId: $ownerId,
            repo: $repo,
            branch: $branch,
            autoDeploy: $autoDeploy,
            envVars: [
              { key: "SESSION_SECRET", value: $sessionSecret },
              { key: "SUPERHOST_EMAIL", value: $superhostEmail },
              { key: "SUPERHOST_PASSWORD", value: $superhostPassword },
              { key: "CLIENT_BYPASS_EMAILS", value: $clientBypassEmails }
            ],
            serviceDetails: {
              runtime: $runtime,
              plan: $plan,
              region: $region,
              healthCheckPath: $healthCheckPath,
              envSpecificDetails: {
                buildCommand: $buildCommand,
                startCommand: $startCommand
              }
            }
          }
          | if $rootDir == "" then del(.rootDir) else .rootDir = $rootDir end
        '
    })"

    local created_json
    created_json="$(api_post '/services' "$payload")"

    service_id="$(jq -r '.id // empty' <<<"$created_json")"
    service_url="$(jq -r '.serviceDetails.url // empty' <<<"$created_json")"

    if [[ -z "$service_id" ]]; then
      echo "Render service creation failed. Response:" >&2
      echo "$created_json" >&2
      exit 1
    fi

    echo "Render service created: $service_id"
  fi

  if [[ -n "${RENDER_CUSTOM_DOMAINS:-}" ]]; then
    IFS=',' read -r -a domain_array <<<"$RENDER_CUSTOM_DOMAINS"
    for raw_domain in "${domain_array[@]}"; do
      local domain
      domain="$(echo "$raw_domain" | xargs)"
      if [[ -z "$domain" ]]; then
        continue
      fi
      local domain_payload
      domain_payload="$(jq -n --arg name "$domain" '{name: $name}')"
      if api_post "/services/$service_id/custom-domains" "$domain_payload" >/dev/null 2>&1; then
        echo "Custom domain added: $domain"
      else
        echo "Could not add custom domain (may already exist): $domain"
      fi
    done

    echo "Custom domain status:"
    api_get "/services/$service_id/custom-domains?limit=100" | jq -r '.[]? | "- \(.customDomain.name): \(.customDomain.verificationStatus)"'
  fi

  echo
  echo "Done."
  echo "Service ID: $service_id"
  if [[ -n "$service_url" ]]; then
    echo "Render URL: $service_url"
  fi
  echo "Dashboard: https://dashboard.render.com/web/$service_id"
}

main "$@"
