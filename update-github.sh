#!/usr/bin/env bash
# =============================================================================
# 极简科普（Git 三格：工作区 → 暂存区 → 远程）
# -----------------------------------------------------------------------------
# 工作区：你改过的文件还在磁盘上，git status 里显示 M（已跟踪改过）或 ??（新文件）。
# git add：把「要进版本库」的改动放进暂存区（像装箱）。
# git commit：给这一箱打一个快照 + 写一句说明（commit message），只在本地多一个提交。
# git push：把「本地比 GitHub 多出来的提交」上传上去；没新提交就会 Everything up-to-date。
#
# 本仓库里 开发者日志.md / DEVELOPMENT_LOG.md 在 .gitignore，脚本不会替你加它们。
# comparables/、*.xlsx 等默认不加（太大或像个人数据）；要加请见下方环境变量。
# =============================================================================
#
# 用法（在项目根目录）：
#
#   ./update-github.sh "用一句话说明这次提交（中文或英文都行）"
#       → 只暂存「代码默认范围」→ commit →（需要时）pull --rebase → push
#
#   ./update-github.sh --push-only
#       → 不 add、不 commit；仅 fetch /（落后则）rebase / push（适合已经自己 commit 过的人）
#
# 可选环境变量（一般不用）：
#   MYVANE_SHIP_EXTRA="path1 path2"   额外要 git add 的路径（空格分隔）
#
set -euo pipefail
cd "$(dirname "$0")"

REMOTE_NAME="${REMOTE_NAME:-origin}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

default_stage_paths() {
  # 日常改代码几乎都在这两个目录；新文件只要在下面也会被一起 add 进来
  local paths=(vane-api vane-ui)
  for f in start-dev.sh update-github.sh md2pdf.py; do
    [[ -e "$f" ]] && paths+=("$f")
  done
  if [[ -n "${MYVANE_SHIP_EXTRA:-}" ]]; then
    # shellcheck disable=SC2206
    paths+=($MYVANE_SHIP_EXTRA)
  fi
  printf '%s\n' "${paths[@]}"
}

push_only_flow() {
  echo "== [--push-only] Remote: $REMOTE_NAME · Branch: $BRANCH"
  git fetch "$REMOTE_NAME"

  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null || [[ -n "$(git status --porcelain -u)" ]]; then
    echo "!! 工作区不干净，--push-only 已中止（请先 commit 或 stash）。"
    git status -sb
    exit 1
  fi

  if ! git rev-parse --verify "@{u}" >/dev/null 2>&1; then
    git push -u "$REMOTE_NAME" "$BRANCH"
    exit 0
  fi

  local behind ahead
  behind="$(git rev-list --count HEAD.."@{u}" 2>/dev/null || echo 0)"
  ahead="$(git rev-list --count "@{u}"..HEAD 2>/dev/null || echo 0)"

  if [[ "$behind" -gt 0 ]]; then
    echo "== 落后远程 $behind 个提交，执行 pull --rebase"
    git pull --rebase "$REMOTE_NAME" "$BRANCH"
  fi

  if [[ "$ahead" -gt 0 ]] || [[ "$behind" -gt 0 ]]; then
    git push "$REMOTE_NAME" "$BRANCH"
  else
    echo "== 已与 $REMOTE_NAME/$BRANCH 同步（没有新提交可推）。"
  fi
}

ship_flow() {
  local msg="$1"
  echo "== [ship] Remote: $REMOTE_NAME · Branch: $BRANCH"
  git fetch "$REMOTE_NAME"

  mapfile -t to_add < <(default_stage_paths)
  echo "== 将暂存: ${to_add[*]}"
  git add "${to_add[@]}"

  echo "== 暂存结果（未纳入的其它文件仍留在工作区，不会进本次提交）"
  git status -sb

  if git diff --cached --quiet; then
    echo "!! 暂存区为空：要么没有可提交的改动，要么改动不在默认路径里。"
    echo "   可设置 MYVANE_SHIP_EXTRA=\"你的路径\" 再运行，或改完代码后再试。"
    exit 1
  fi

  echo "== git commit"
  git commit -m "$msg"

  local behind
  behind="$(git rev-list --count HEAD.."@{u}" 2>/dev/null || echo 0)"
  if [[ "$behind" -gt 0 ]]; then
    echo "== 落后远程 $behind 个提交，执行 pull --rebase 后再 push"
    git pull --rebase "$REMOTE_NAME" "$BRANCH"
  fi

  if git rev-parse --verify "@{u}" >/dev/null 2>&1; then
    git push "$REMOTE_NAME" "$BRANCH"
  else
    git push -u "$REMOTE_NAME" "$BRANCH"
  fi
  echo "== 完成。"
}

if [[ "${1:-}" == "--push-only" ]]; then
  push_only_flow
  exit 0
fi

if [[ -n "${1:-}" ]]; then
  ship_flow "$1"
  exit 0
fi

cat <<'EOF'
用法：
  ./update-github.sh "本次提交的简短说明"
  ./update-github.sh --push-only

默认会 git add：vane-api/、vane-ui/、以及根目录存在的 start-dev.sh / update-github.sh / md2pdf.py
不会自动 add：comparables/、*.xlsx 等（避免误传大文件或私货）。需要时用：
  MYVANE_SHIP_EXTRA="某个路径" ./update-github.sh "说明"

三句话记住 Git：
  1) git add    —— 选哪些改动要打包
  2) git commit —— 打包并写一句话（只在本地）
  3) git push   —— 把新包上传到 GitHub
EOF
exit 1
