#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

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

gh_api() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"

  local url="https://api.github.com${path}"

  if [[ -n "$payload" ]]; then
    curl -fsSL \
      -X "$method" \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      -H "Content-Type: application/json" \
      -d "$payload" \
      "$url"
  else
    curl -fsSL \
      -X "$method" \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "$url"
  fi
}

repo_exists() {
  local owner="$1"
  local repo="$2"

  local code
  code="$(curl -s -o /tmp/github-repo-check.json -w "%{http_code}" \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/${owner}/${repo}")"

  [[ "$code" == "200" ]]
}

ensure_local_git_repo() {
  cd "$PROJECT_ROOT"

  if [[ ! -d .git ]]; then
    git init
  fi

  if ! git config user.name >/dev/null; then
    git config user.name "Future EA Pro Bot"
  fi
  if ! git config user.email >/dev/null; then
    git config user.email "nhlanhlamashapa11@gmail.com"
  fi

  git add .
  if ! git diff --cached --quiet; then
    git commit -m "Prepare Future EA Pro deployment"
  fi

  if [[ -z "$(git rev-parse --verify HEAD 2>/dev/null || true)" ]]; then
    echo "No commit found. Commit the project first." >&2
    exit 1
  fi
}

create_repo_if_needed() {
  local owner="$1"
  local repo="$2"
  local private_flag="$3"

  if repo_exists "$owner" "$repo"; then
    echo "GitHub repo exists: ${owner}/${repo}"
    return
  fi

  local payload
  payload="$(jq -n \
    --arg name "$repo" \
    --argjson private "$private_flag" \
    '{name: $name, private: $private, auto_init: false}')"

  gh_api POST "/user/repos" "$payload" >/tmp/github-create-repo.json
  echo "GitHub repo created: ${owner}/${repo}"
}

push_to_github() {
  local owner="$1"
  local repo="$2"
  local branch="$3"

  local remote_url="https://github.com/${owner}/${repo}.git"
  local auth_b64
  auth_b64="$(printf "x-access-token:%s" "$GITHUB_TOKEN" | base64 | tr -d '\n')"

  cd "$PROJECT_ROOT"

  if git remote get-url origin >/dev/null 2>&1; then
    git remote set-url origin "$remote_url"
  else
    git remote add origin "$remote_url"
  fi

  git -c http.https://github.com/.extraheader="AUTHORIZATION: basic ${auth_b64}" \
    push -u origin "$branch"
  echo "GitHub push complete: ${remote_url}"
}

main() {
  require_cmd curl
  require_cmd jq
  require_cmd git

  require_env GITHUB_TOKEN
  require_env RENDER_API_KEY

  local github_repo="${GITHUB_REPO:-futureeapro}"
  local github_branch="${GITHUB_BRANCH:-main}"
  local github_private="${GITHUB_PRIVATE:-false}"
  local render_service_name="${RENDER_SERVICE_NAME:-futureeapro-web}"
  local render_domains="${RENDER_CUSTOM_DOMAINS:-futureeapro.com,www.futureeapro.com}"

  local github_owner="${GITHUB_OWNER:-}"
  if [[ -z "$github_owner" ]]; then
    github_owner="$(gh_api GET '/user' | jq -r '.login')"
  fi

  if [[ -z "$github_owner" || "$github_owner" == "null" ]]; then
    echo "Unable to resolve GitHub owner login." >&2
    exit 1
  fi

  ensure_local_git_repo
  create_repo_if_needed "$github_owner" "$github_repo" "$github_private"
  push_to_github "$github_owner" "$github_repo" "$github_branch"

  local repo_url="https://github.com/${github_owner}/${github_repo}"

  cd "$PROJECT_ROOT"
  RENDER_REPO_URL="$repo_url" \
  RENDER_SERVICE_NAME="$render_service_name" \
  RENDER_BRANCH="$github_branch" \
  RENDER_CUSTOM_DOMAINS="$render_domains" \
  bash "$SCRIPT_DIR/create-render-web-service.sh"

  echo
  echo "Bootstrap complete."
  echo "GitHub Repo: $repo_url"
}

main "$@"
