#!/usr/bin/env bash
# deploy.sh — штатная точка deploy-подготовки и установки @goodandready/dsh-clinebot.
#
# Режимы:
#   bash deploy.sh check
#       Проверка ветки: сборка клиента, тесты, лимит размера файлов (256 KiB),
#       сборка релиз-кандидата .tgz в dist/. Ничего не меняет в runtime.
#
#   DSH_CLINEBOT_APPROVED=yes bash deploy.sh install <exact-version>
#       Установка ТОЧНОЙ опубликованной registry-версии в production web-профиль
#       и post-install проверки. Требует явного «ок» владельца:
#       без DSH_CLINEBOT_APPROVED=yes скрипт откажется выполняться.
#
#   bash deploy.sh verify [exact-version]
#       Только post-install проверки уже установленного профиля: фактическая
#       версия, доступ к web UI и загрузка клиентского бандла.

set -euo pipefail

MODE="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PACKAGE_NAME="@goodandready/dsh-clinebot"
SIZE_HARD_LIMIT=262144   # 256 KiB — лимит DSH Store
SIZE_WARN_LIMIT=256000   # порог предупреждения
WEB_BASE="${DSH_WEB_BASE:-http://127.0.0.1:3080}"
WEB_UNIT="${DSH_WEB_UNIT:-dsh-web.service}"

fail() { echo "ERROR: $*" >&2; exit 1; }

require_node() {
  command -v node >/dev/null 2>&1 || fail "node not found in PATH"
  command -v npm >/dev/null 2>&1 || fail "npm not found in PATH"
}

print_context() {
  echo "package: $PACKAGE_NAME"
  echo "version: $(node -p "require('./package.json').version")"
  echo "branch:  $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  echo "commit:  $(git rev-parse HEAD 2>/dev/null || echo unknown)"
}

build_client() {
  echo "building client bundle..."
  node scripts/build-client.js
}

run_tests() {
  echo "running tests..."
  npm test
}

pack_size_gate() {
  echo "checking package size limits..."
  npm pack --dry-run --json | node -e '
    let s = "";
    process.stdin.on("data", d => s += d);
    process.stdin.on("end", () => {
      const data = JSON.parse(s);
      const entry = Array.isArray(data) ? data[0] : Object.values(data)[0];
      const files = (entry && entry.files) || [];
      if (!files.length) {
        console.error("BLOCKED pack listing is empty — cannot verify size limit");
        process.exit(1);
      }
      const warn = files.filter(f => f.size >= 256000 && f.size <= 262144);
      const bad = files.filter(f => f.size > 262144);
      for (const f of warn) console.error(`WARNING ${f.size} bytes ${f.path}`);
      for (const f of bad) console.error(`BLOCKED ${f.size} bytes ${f.path}`);
      if (bad.length) process.exit(1);
      console.log(`size gate: ${files.length} files, all <= 256 KiB`);
    });'
}

build_candidate() {
  mkdir -p dist
  rm -f dist/*.tgz
  local tarball
  tarball="$(npm pack --loglevel=error | tail -1)"
  mv "$tarball" dist/
  echo "candidate: dist/$tarball"
}

resolve_web_token() {
  if [ -n "${DSH_WEB_TOKEN:-}" ]; then
    printf '%s' "$DSH_WEB_TOKEN"
    return 0
  fi
  journalctl -u "$WEB_UNIT" --since '-24h' --no-pager 2>/dev/null \
    | grep -oE 'token=[A-Za-z0-9_-]+' | tail -1 | cut -d= -f2 || true
}

post_install_checks() {
  local expected_version="$1"
  echo "--- post-install checks ---"
  local listed
  listed="$(dsh plugin --profile web list 2>/dev/null | grep -F "$PACKAGE_NAME@$expected_version" || true)"
  [ -n "$listed" ] || fail "installed profile does not report $PACKAGE_NAME@$expected_version"
  echo "profile: $listed"

  local token jar index bundle_url bundle_code bundle_file
  token="$(resolve_web_token)"
  jar="$(mktemp)"
  bundle_file="$(mktemp)"
  trap "rm -f '$jar' '$bundle_file'" RETURN EXIT

  if [ -n "$token" ]; then
    curl -fsS -c "$jar" -o /dev/null "$WEB_BASE/?token=$token" || fail "DSH web UI rejected the token on $WEB_BASE"
    echo "web UI: authenticated"
  else
    echo "web UI: DSH_WEB_TOKEN is not set and $WEB_UNIT logged no token; trying anonymous access"
  fi

  index="$(curl -fsS -b "$jar" "$WEB_BASE/")" || fail "DSH web UI is not answering on $WEB_BASE"
  printf '%s' "$index" | grep -qF "$PACKAGE_NAME" || fail "client entry not found in the DSH index"

  bundle_url="$(printf '%s' "$index" \
    | tr '"' '\n' | grep -F 'plugins/??' | grep -F "$PACKAGE_NAME" | head -1 | sed 's/&amp;/\&/g')"
  bundle_url="/${bundle_url#/}"
  [ -n "$bundle_url" ] || fail "no combined plugin bundle URL for $PACKAGE_NAME in the DSH index"

  bundle_code="$(curl -s -b "$jar" -H "Referer: $WEB_BASE/" -o "$bundle_file" -w '%{http_code}' "$WEB_BASE$bundle_url")"
  [ "$bundle_code" = "200" ] || fail "client bundle not served (HTTP $bundle_code)"
  echo "client bundle: HTTP $bundle_code"
  grep -qF "$PACKAGE_NAME" "$bundle_file" \
    || fail "client bundle for $PACKAGE_NAME came back without the package name"
  echo "post-install checks passed"
}

case "$MODE" in
  check)
    require_node
    print_context
    build_client
    run_tests
    pack_size_gate
    build_candidate
    echo "check: OK — candidate ready for release cycle"
    ;;
  install)
    require_node
    command -v dsh >/dev/null 2>&1 || fail "dsh CLI not found in PATH"
    [ "${DSH_CLINEBOT_APPROVED:-}" = "yes" ] || fail "production install requires explicit owner approval: run with DSH_CLINEBOT_APPROVED=yes"
    local_version="$(node -p "require('./package.json').version")"
    TARGET_VERSION="${2:-}"
    [ -n "$TARGET_VERSION" ] || fail "usage: DSH_CLINEBOT_APPROVED=yes bash deploy.sh install <exact-version>"
    [ "$TARGET_VERSION" = "$local_version" ] || fail "target version $TARGET_VERSION does not match package.json $local_version"
    echo "installing $PACKAGE_NAME@$TARGET_VERSION into the DSH web profile"
    dsh plugin --profile web add "$PACKAGE_NAME@$TARGET_VERSION"
    post_install_checks "$TARGET_VERSION"
    ;;
  verify)
    command -v dsh >/dev/null 2>&1 || fail "dsh CLI not found in PATH"
    command -v node >/dev/null 2>&1 || fail "node not found in PATH"
    post_install_checks "${2:-$(node -p "require('./package.json').version")}"
    ;;
  *)
    fail "usage: bash deploy.sh check | DSH_CLINEBOT_APPROVED=yes bash deploy.sh install <exact-version> | bash deploy.sh verify [exact-version]"
    ;;
esac
