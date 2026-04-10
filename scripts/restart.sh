#!/usr/bin/env bash

log() { echo "[restart.sh] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

is_alive() {
    pgrep -f "openclaw-gateway|openclaw gateway" | grep -v "$$" >/dev/null 2>&1 && return 0
    pgrep -x "openclaw" >/dev/null 2>&1 && return 0
    return 1
}

if [ -d "/run/systemd/system/" ]; then
    log "systemd detected, restarting via systemctl..."
    sudo systemctl restart openclaw
    log "systemctl restart exit code: $?"
else
    log "killing openclaw processes..."
    PIDS_GW=$(pgrep -f "openclaw-gateway|openclaw gateway" | grep -v "$$" || true)
    PIDS_OC=$(pgrep -x "openclaw" || true)
    [ -n "$PIDS_GW" ] && log "killing gateway pids: $PIDS_GW" && kill -9 $PIDS_GW 2>&1
    [ -n "$PIDS_OC" ] && log "killing openclaw pids: $PIDS_OC" && kill -9 $PIDS_OC 2>&1
    [ -z "$PIDS_GW" ] && [ -z "$PIDS_OC" ] && log "no openclaw processes found"

    for i in $(seq 1 50); do
        is_alive || break
        sleep 0.1
    done

    if is_alive; then
        log "ERROR: openclaw processes still alive after 5s, abort"
        exit 1
    fi
    log "all openclaw processes stopped"

    log "starting openclaw gateway..."
    nohup openclaw gateway run --port 18789 > /tmp/openclaw-gateway.log 2>&1 &
    log "gateway started (pid=$!)"
fi