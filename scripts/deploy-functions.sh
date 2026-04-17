#!/usr/bin/env bash
# Deploy all Edge Functions to the hosted Supabase project.
# Requires: supabase CLI logged in and linked (`supabase link --project-ref <ref>`).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FUNCTIONS=(
  advisor
  generate-cv
  generate-letter
  send-application
  process-inbox
  german-teacher
  process-upload
  workflow-advance
)

echo "Deploying ${#FUNCTIONS[@]} functions..."
for fn in "${FUNCTIONS[@]}"; do
  echo "── $fn"
  supabase functions deploy "$fn" --no-verify-jwt="$([ "$fn" = "process-upload" ] || [ "$fn" = "process-inbox" ] && echo true || echo false)"
done

echo "Setting secrets from .env.local..."
supabase secrets set --env-file .env.local \
  ANTHROPIC_API_KEY \
  OPENAI_API_KEY \
  GOOGLE_CLIENT_ID \
  GOOGLE_CLIENT_SECRET \
  EMAIL_TOKEN_ENCRYPTION_KEY || true

echo "Done."
