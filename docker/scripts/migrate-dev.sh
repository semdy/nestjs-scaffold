#!/bin/sh
set -e

if npm run migration:run; then
  exit 0
fi

echo "Migration failed, checking if CDC schema is already present..."
node docker/scripts/verify-cdc-schema.cjs
