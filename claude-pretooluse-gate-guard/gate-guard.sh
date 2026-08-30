#!/bin/sh
# Claude Code PreToolUse guard: deny a Bash tool call whose single
# command BOTH runs the quality gate AND performs a git commit or push.
# In one compound command the mutation cannot depend on the gate's exit
# code being READ, only on shell operators — and `;`-chaining (or a
# pipe that masks the pipeline status) runs the mutation regardless of
# the gate result. This hook fails that shape fast, before a bad commit
# exists; the deterministic backstop is a green-stamp pre-push hook
# (see ../green-stamp-push-gate/).
#
# Adjust GATE_PATTERN to the substring that identifies your gate.
GATE_PATTERN="pre-pr"

# Matches a git commit/push invocation even when global options sit
# between "git" and the verb (git -C <path> commit, git --git-dir=<d>
# push, git -c k=v commit) or whitespace is repeated. Each "-opt" may
# carry one separate non-dash argument. Deliberately over-matches text
# that merely MENTIONS such a command — a priced-in false positive.
GIT_MUTATION_RE='(^|[^[:alnum:]_.-])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+(commit|push)([^[:alnum:]_-]|$)'

payload=$(cat)
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')
case "$cmd" in
  *"$GATE_PATTERN"*)
    if printf '%s' "$cmd" | grep -Eq "$GIT_MUTATION_RE"; then
      printf '%s' "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"Working rule: never chain git commit/push in the same command as the quality gate — a chained mutation cannot depend on reading the gate's exit code. Run the gate as its own command, read the exit code, then commit/push separately.\"}}"
      exit 0
    fi
    ;;
esac
exit 0
