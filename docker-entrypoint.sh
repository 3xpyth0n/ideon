#!/bin/sh
set -e

# Ensure subdirectories exist
mkdir -p storage/avatars storage/yjs storage/uploads .next/cache

# Fix permissions if running as root
if [ "$(id -u)" = '0' ]; then
    # Set default PUID/PGID if not provided
    PUID=${PUID:-1001}
    PGID=${PGID:-1001}

    # Update appuser UID/GID if necessary to match requested ID
    if [ "$(id -u appuser)" != "$PUID" ]; then
        usermod -o -u "$PUID" appuser
    fi
    if [ "$(id -g appuser)" != "$PGID" ]; then
        groupmod -o -g "$PGID" appuser
    fi

    # Fix ownership
    chown -R appuser:appuser storage .next/cache

    # Run the application as appuser
    exec su-exec appuser "$@"
else
    # Already running as non-root user
    exec "$@"
fi
