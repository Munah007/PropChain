#!/usr/bin/env bash
# Keep the keeper up.
#
# Nothing else settles bets. When this process is gone the board keeps looking
# healthy — matches go to "Awaiting proof" and simply stay there — so a silent
# death is expensive and invisible. It has already happened once: the keeper
# stopped at 07:28 and nobody noticed for eight hours.
#
# The keeper itself already retries the TxLINE stream and survives a failed
# reconcile. What it cannot survive is the process ending: a lost terminal,
# a laptop suspend, an OOM. That is what this covers.
#
#   ./keeper/supervise.sh              # from the repo root
#   RESTART_CAP_S=120 ./keeper/supervise.sh
#
# Logs go to stdout — redirect where you like. Ctrl-C stops supervising.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

BASE_S="${RESTART_BASE_S:-2}"
CAP_S="${RESTART_CAP_S:-60}"
backoff="$BASE_S"
restarts=0
started_at=$(date +%s)

stamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

trap 'echo "$(stamp) [supervisor] stopping ($restarts restart(s) in $(( $(date +%s) - started_at ))s)"; exit 0' INT TERM

echo "$(stamp) [supervisor] starting keeper — restart backoff ${BASE_S}s..${CAP_S}s"

while true; do
  run_start=$(date +%s)
  npm run keeper
  code=$?
  ran_for=$(( $(date +%s) - run_start ))
  restarts=$((restarts + 1))

  # A run that lasted a while was healthy; treat the next failure as fresh
  # rather than compounding backoff from an unrelated outage hours ago.
  if [ "$ran_for" -ge 60 ]; then
    backoff="$BASE_S"
  fi

  echo "$(stamp) [supervisor] keeper exited (code $code) after ${ran_for}s — restart #${restarts} in ${backoff}s"
  sleep "$backoff"

  # Exponential up to the cap: a keeper crash-looping on bad credentials should
  # not spin the CPU, but a transient network blip should recover in seconds.
  backoff=$(( backoff * 2 ))
  [ "$backoff" -gt "$CAP_S" ] && backoff="$CAP_S"
done
