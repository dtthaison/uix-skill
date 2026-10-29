#!/usr/bin/env bash
# Symlink skills/uix-skill into ~/.claude/skills and/or ~/.codex/skills.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: link-local.sh [--claude] [--codex] [--uninstall]

  --claude     target $HOME/.claude/skills/uix-skill (default if no target given)
  --codex      target $HOME/.codex/skills/uix-skill
  --uninstall  remove our symlinks at the selected targets (nothing else)
  -h, --help   show this help
USAGE
}

claude=0; codex=0; uninstall=0
for arg in "$@"; do
  case "$arg" in
    --claude) claude=1 ;;
    --codex) codex=1 ;;
    --uninstall) uninstall=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done
if [ "$claude" -eq 0 ] && [ "$codex" -eq 0 ]; then claude=1; fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
src="$root/skills/uix-skill"
[ -d "$src" ] || { echo "missing $src" >&2; exit 1; }

# true if $1 is a symlink that resolves to $src
is_ours() {
  [ -L "$1" ] || return 1
  local resolved
  resolved="$(cd "$1" 2>/dev/null && pwd -P)" || return 1
  [ "$resolved" = "$src" ]
}

targets=()
[ "$claude" -eq 1 ] && targets+=("$HOME/.claude/skills/uix-skill")
[ "$codex" -eq 1 ] && targets+=("$HOME/.codex/skills/uix-skill")

# Pass 1: validate, so a refusal touches nothing.
if [ "$uninstall" -eq 0 ]; then
  for t in "${targets[@]}"; do
    if { [ -e "$t" ] || [ -L "$t" ]; } && ! is_ours "$t"; then
      echo "refusing to overwrite $t" >&2
      exit 2
    fi
  done
fi

for t in "${targets[@]}"; do
  if [ "$uninstall" -eq 1 ]; then
    if is_ours "$t"; then
      rm "$t"; echo "removed: $t"
    elif [ -e "$t" ] || [ -L "$t" ]; then
      echo "skipped (not ours): $t"
    else
      echo "not present: $t"
    fi
  else
    if is_ours "$t"; then
      echo "already linked: $t"
    else
      mkdir -p "$(dirname "$t")"
      ln -s "$src" "$t"
      echo "linked: $t -> $src"
    fi
  fi
done
