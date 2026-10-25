#!/usr/bin/env bash
set -euo pipefail

# These changes apply only to disposable Linux GitHub Actions runners.
if [[ "${GITHUB_ACTIONS:-}" != "true" || "${RUNNER_OS:-}" != "Linux" ]]; then
  echo "This browser setup helper is restricted to Linux GitHub Actions runners." >&2
  exit 1
fi

# The runner's default Azure mirror stalled on small dependency downloads.
# Keep the official, signed Ubuntu repositories and the Azure fallback, but
# prefer Ubuntu's archive. Format follows actions/runner-images' mirror list.
if [[ -f /etc/apt/apt-mirrors.txt ]]; then
  printf '%b\n' \
    'https://archive.ubuntu.com/ubuntu/\tpriority:1' \
    'https://security.ubuntu.com/ubuntu/\tpriority:2' \
    'http://azure.archive.ubuntu.com/ubuntu/\tpriority:3' \
    | sudo tee /etc/apt/apt-mirrors.txt >/dev/null
fi
printf '%s\n' 'Acquire::http::Timeout "20";' 'Acquire::https::Timeout "20";' 'Acquire::Retries "1";' \
  | sudo tee /etc/apt/apt.conf.d/99-agristore-test-timeouts >/dev/null
npx playwright install --with-deps chromium
