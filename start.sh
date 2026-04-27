#!/bin/sh
set -e

uvicorn backend:app --host 127.0.0.1 --port 8000 &
nginx -g "daemon off;"
