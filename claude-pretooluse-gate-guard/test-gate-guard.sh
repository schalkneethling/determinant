#!/bin/sh
# Regression pipe-test for gate-guard.sh: feeds the hook the stdin JSON
# Claude Code would send and asserts deny/pass. Run from this directory:
#   sh test-gate-guard.sh
set -u

guard="$(dirname "$0")/gate-guard.sh"
fails=0

check() {
  want=$1; desc=$2; command=$3
  out=$(printf '{"tool_name":"Bash","tool_input":{"command":%s}}' \
    "$(printf '%s' "$command" | jq -Rs .)" | sh "$guard")
  case "$out" in
    *'"deny"'*) got=deny ;;
    *) got=pass ;;
  esac
  if [ "$got" = "$want" ]; then
    echo "ok   ($want) $desc"
  else
    echo "FAIL (want $want, got $got) $desc: $command"
    fails=$((fails + 1))
  fi
}

# Denied: gate chained with a git mutation, in every shape that burned us
# or that plain substring matching missed.
check deny "semicolon chain (the historical incident shape)" \
  'npm run pre-pr; git commit -m "done"'
check deny "pipe-masked exit code then push" \
  'npm run pre-pr 2>&1 | tail -2 && git push'
check deny "git -C between git and verb" \
  'npm run pre-pr && git -C ../repo commit -m x'
check deny "git --git-dir=... push" \
  'npm run pre-pr; git --git-dir=/tmp/r/.git push origin main'
check deny "git --git-dir with separate arg" \
  'npm run pre-pr; git --git-dir /tmp/r/.git push'
check deny "git -c config override before commit" \
  'npm run pre-pr && git -c user.name=x commit -m y'
check deny "repeated whitespace between tokens" \
  'npm run pre-pr &&  git    commit  -m x'
check deny "absolute git path" \
  'npm run pre-pr; /usr/bin/git push'

# Passed: no gate in the command, or gate alone, or no git mutation.
check pass "gate alone" 'npm run pre-pr'
check pass "commit alone (no gate in command)" 'git commit -m "regular commit"'
check pass "gate with non-mutating git" 'npm run pre-pr && git status'
check pass "words containing git (legit)" 'npm run pre-pr # legit pushback'
check pass "git push-like but not the verb" 'npm run pre-pr && git pushx'
check pass "unrelated command" 'ls -la'

[ "$fails" -eq 0 ] && echo "all gate-guard regression cases passed"
exit "$fails"
