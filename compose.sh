#!/bin/bash

# Define the base command using both production and dev override files
# This ensures we use the local build (from dev.yml) instead of the GHCR image
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.dev.yml"

show_help() {
    echo "Usage: ./compose.sh [command]"
    echo ""
    echo "Commands:"
    echo "  build   Build the images"
    echo "  start   Start the stack"
    echo "  restart Restart the stack"
    echo "  stop    Stop the stack"
    echo "  down    Stop and remove containers"
    echo ""
}

# If no arguments provided, show help.
if [ -z "$1" ]; then
    show_help
    exit 1
fi

case "$1" in
    start)
        echo "Starting stack..."
        $COMPOSE up -d
        ;;
    restart)
        echo "Restarting stack..."
        $COMPOSE down
        $COMPOSE up -d
        ;;
    stop)
        echo "Stopping stack..."
        $COMPOSE stop
        ;;
    down)
        echo "Tearing down stack..."
        $COMPOSE down
        ;;
    build)
        echo "Building stack..."
        $COMPOSE build
        ;;
    *)
        echo "Error: Unknown command '$1'"
        show_help
        exit 1
        ;;
esac
