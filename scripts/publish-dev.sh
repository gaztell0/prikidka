#!/usr/bin/env bash
set -euo pipefail
set +x

# This job is deliberately unavailable to pull requests and production.
if [[ ${GITHUB_REPOSITORY:-} != gaztell0/prikidka || ${GITHUB_REF:-} != refs/heads/dev ]]; then
  echo 'Development deployment is allowed only from gaztell0/prikidka, branch dev.' >&2
  exit 1
fi
case ${GITHUB_EVENT_NAME:-} in
  push|workflow_dispatch) ;;
  *) echo 'Development deployment does not run for this event.' >&2; exit 1 ;;
esac
if [[ ! ${GITHUB_SHA:-} =~ ^[0-9a-f]{40}$ ]]; then
  echo 'A valid source commit is required.' >&2
  exit 1
fi
if [[ -z ${DEV_DEPLOY_KEY:-} ]]; then
  echo 'Configure the PRIKIDKA_DEV_DEPLOY_KEY Actions secret before deploying dev.' >&2
  exit 1
fi

umask 077
work_dir=$(mktemp -d)
trap 'rm -rf -- "$work_dir"' EXIT
key_file="$work_dir/id_ed25519"
hosts_file="$work_dir/known_hosts"
printf '%s\n' "${DEV_DEPLOY_KEY//$'\r'/}" > "$key_file"
unset DEV_DEPLOY_KEY
# Published by GitHub: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
printf '%s\n' 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl' > "$hosts_file"
export GIT_SSH_COMMAND="ssh -F /dev/null -i \"$key_file\" -o UserKnownHostsFile=\"$hosts_file\" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o HostKeyAlgorithms=ssh-ed25519"
export GIT_SSH_VARIANT=ssh

target_dir="$work_dir/site"
git -c core.hooksPath=/dev/null clone --depth 1 --single-branch --branch gh-pages git@github.com:gaztell0/prikidka-dev.git "$target_dir"
# The target repository stores generated site files only.
git -C "$target_dir" rm -r --ignore-unmatch -- .
for file in index.html style.css app.js model.js .nojekyll; do
  source_file="${GITHUB_WORKSPACE:?}/$file"
  if [[ ! -f $source_file || -L $source_file ]]; then
    echo "Missing regular site file: $file" >&2
    exit 1
  fi
  cp -- "$source_file" "$target_dir/$file"
done
python3 - "$target_dir" "$GITHUB_SHA" <<'PY'
from pathlib import Path
import json, sys
root = Path(sys.argv[1])
page = root/'index.html'
html = page.read_text()
if '<title>' not in html:
    raise SystemExit('The site title is missing')
page.write_text(html.replace('<title>', '<title>DEV · ', 1))
(root/'deployment.json').write_text(json.dumps({
    'environment': 'dev',
    'repository': 'gaztell0/prikidka',
    'branch': 'dev',
    'sha': sys.argv[2],
}, indent=2) + '\n')
PY

# Queued runs must not replace a newer development revision.
latest_sha=$(git ls-remote https://github.com/gaztell0/prikidka.git refs/heads/dev | cut -f1)
if [[ $latest_sha != "$GITHUB_SHA" ]]; then
  echo 'A newer dev commit exists; skipping this outdated snapshot.'
  exit 0
fi
git -C "$target_dir" add -- index.html style.css app.js model.js .nojekyll deployment.json
if git -C "$target_dir" diff --cached --quiet; then
  echo 'Development snapshot is already current.'
  exit 0
fi
git -C "$target_dir" -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' commit -m "Deploy dev $GITHUB_SHA"
git -C "$target_dir" push origin HEAD:gh-pages
