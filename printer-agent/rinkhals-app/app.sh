#!/bin/sh

. /useremain/rinkhals/.current/tools.sh

export AGENT_ROOT=$(dirname $(realpath $0))
export AGENT_CONFIG="$AGENT_ROOT/config.json"
export AGENT_STDOUT_LOG="$AGENT_ROOT/agent.stdout.log"

status() {
    PIDS=$(get_by_name "agent.main")

    if [ "$PIDS" == "" ]; then
        report_status $APP_STATUS_STOPPED
    else
        report_status $APP_STATUS_STARTED "$PIDS" "$AGENT_ROOT/agent.log"
    fi
}

start() {
    kill_by_name "agent.main"

    cd $AGENT_ROOT
    log "Starting Hub print agent from $AGENT_ROOT"
    python3 -m agent.main --config $AGENT_CONFIG --loop >> $AGENT_STDOUT_LOG 2>&1 &
}

stop() {
    kill_by_name "agent.main"
}

case "$1" in
    status)
        status
        ;;
    start)
        start
        ;;
    stop)
        stop
        ;;
    *)
        echo "Usage: $0 {status|start|stop}" >&2
        exit 1
        ;;
esac
