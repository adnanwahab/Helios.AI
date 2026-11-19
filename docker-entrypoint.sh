#!/bin/sh
set -eu
mkdir -p /data/backups
chown bun:bun /data /data/backups
exec su bun -s /bin/sh -c 'exec bun --no-env-file server.js'
