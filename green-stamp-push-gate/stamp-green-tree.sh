#!/bin/sh
# Green-tree stamping: record that THIS exact working tree passed your
# quality gate. Run it as the last step of the gate (only on success):
#
#   npm run gate && ./green-stamp-push-gate/stamp-green-tree.sh
#
# or call it from inside the gate script after all checks pass.
#
# The tree hash covers tracked AND untracked-unignored files — i.e. the
# content the gate actually tested — computed through a TEMPORARY git
# index; your real index is never touched. The companion pre-push hook
# refuses to push any commit whose tree has no stamp.
set -eu

repo_root=$(git rev-parse --show-toplevel)
git_dir=$(git -C "$repo_root" rev-parse --git-dir)
stamp_file="$git_dir/green-tree-stamps"

tmp_index=$(mktemp)
trap 'rm -f "$tmp_index"' EXIT
# mktemp creates the file; git wants to create its own index there.
rm -f "$tmp_index"

GIT_INDEX_FILE="$tmp_index" git -C "$repo_root" add -A .
tree=$(GIT_INDEX_FILE="$tmp_index" git -C "$repo_root" write-tree)

printf '%s\n' "$tree" >> "$stamp_file"
echo "push gate: stamped green tree $tree"
