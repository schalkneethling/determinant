#!/bin/sh
# Green-tree stamping: record that THIS exact working tree passed your
# quality gate. Run it as the last step of the gate (only on success):
#
#   npm run gate && ./green-stamp-push-gate/stamp-green-tree.sh
#
# or call it from inside the gate script after all checks pass.
#
# To also close the window where content changes WHILE the gate runs,
# capture the tree before the gate and hand it back at stamp time — the
# stamp is refused if the tree the gate started on is not the tree
# being stamped:
#
#   pre=$(./green-stamp-push-gate/stamp-green-tree.sh --hash-only)
#   npm run gate && ./green-stamp-push-gate/stamp-green-tree.sh "$pre"
#
# The tree hash covers tracked AND untracked-unignored files — i.e. the
# content the gate actually tested — computed through a TEMPORARY git
# index; your real index is never touched. The companion pre-push hook
# refuses to push any commit whose tree has no stamp. Note this fails
# CLOSED: an untracked-unignored file that is not part of the commit
# makes the stamped tree differ from the commit tree, so the push is
# refused until the file is committed or ignored.
set -eu

hash_only=false
expected=""
case "${1:-}" in
  --hash-only) hash_only=true ;;
  "") ;;
  *) expected=$1 ;;
esac

repo_root=$(git rev-parse --show-toplevel)
git_dir=$(git -C "$repo_root" rev-parse --git-dir)
stamp_file="$git_dir/green-tree-stamps"

tmp_index=$(mktemp)
trap 'rm -f "$tmp_index"' EXIT
# mktemp creates the file; git wants to create its own index there.
rm -f "$tmp_index"

GIT_INDEX_FILE="$tmp_index" git -C "$repo_root" add -A .
tree=$(GIT_INDEX_FILE="$tmp_index" git -C "$repo_root" write-tree)

if [ "$hash_only" = true ]; then
  printf '%s\n' "$tree"
  exit 0
fi

if [ -n "$expected" ] && [ "$expected" != "$tree" ]; then
  echo "push gate: REFUSING to stamp — the tree changed while the gate ran" >&2
  echo "  gate started on $expected" >&2
  echo "  tree is now      $tree" >&2
  echo "  Re-run the gate on the current content." >&2
  exit 1
fi

printf '%s\n' "$tree" >> "$stamp_file"
echo "push gate: stamped green tree $tree"
