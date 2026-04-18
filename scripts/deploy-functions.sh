#!/usr/bin/env bash
# Redeploy just the Edge Functions (keeps DB + secrets as-is).
# Prereq: already linked via `supabase link --project-ref <ref>`.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# process-upload = triggered by Storage webhook
# process-inbox  = triggered by cron
# Both bypass user JWT verification.
NO_JWT=(process-upload process-inbox)
WITH_JWT=(advisor generate-cv generate-letter send-application german-teacher workflow-advance)

for fn in "${WITH_JWT[@]}"; do
  echo "── $fn"
  supabase functions deploy "$fn"
done
for fn in "${NO_JWT[@]}"; do
  echo "── $fn (no-verify-jwt)"
  supabase functions deploy "$fn" --no-verify-jwt
done

echo "✅ Functions deployed."
