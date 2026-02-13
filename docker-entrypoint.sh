#!/bin/sh
set -e

# Ensure subdirectories exist
mkdir -p storage/avatars storage/yjs storage/uploads .next/cache

# Fix permissions if running as root
if [ "$(id -u)" = '0' ]; then
    chown -R appuser:appuser storage .next

    # Run the application as appuser
    exec su-exec appuser "$@"
else
    # Already running as non-root user
    exec "$@"
fi
