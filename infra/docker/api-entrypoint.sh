#!/bin/sh
# Smart Grocery AI — API container entrypoint.
#
# IMPORTANT: this file MUST be saved with LF line endings (not CRLF).
# A CRLF shebang makes the kernel look for "/bin/sh\r" and the container
# dies with "no such file or directory". If you edit on Windows, make sure
# your editor / .gitattributes keeps this file LF.
set -e

echo "[entrypoint] Applying database migrations..."
npx prisma migrate deploy --schema /app/apps/api/prisma/schema.prisma

echo "[entrypoint] Starting API..."
exec node /app/apps/api/dist/main.js
