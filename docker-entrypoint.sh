#!/bin/sh
set -e

# Ensure subdirectories exist
mkdir -p storage/avatars storage/yjs storage/uploads .next/cache

# Fix permissions if running as root
if [ "$(id -u)" = '0' ]; then
    PUID=${PUID:-1001}
    PGID=${PGID:-1001}

    if command -v usermod >/dev/null 2>&1; then
        if [ "$(id -u appuser)" != "$PUID" ]; then
            usermod -o -u "$PUID" appuser
        fi
    else
        echo "usermod not found, skipping UID change"
    fi

    if command -v groupmod >/dev/null 2>&1; then
        if [ "$(id -g appuser)" != "$PGID" ]; then
            groupmod -o -g "$PGID" appuser
        fi
    else
        echo "groupmod not found, skipping GID change"
    fi

    chown -R appuser:appuser storage .next/cache

    # Prefer su-exec or gosu if available, else fall back to su
    if command -v su-exec >/dev/null 2>&1; then
        exec su-exec appuser "$@"
    elif command -v gosu >/dev/null 2>&1; then
        exec gosu appuser "$@"
    else
        exec su -s /bin/sh appuser -c "$*"
    fi
else
    exec "$@"
fi
