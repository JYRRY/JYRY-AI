#!/usr/bin/env bash
# Nuke and restart the local Supabase stack. Useful during schema iteration.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

supabase stop --no-backup || true
supabase start
supabase db reset
echo "Local Supabase ready. Studio: http://localhost:54323"
