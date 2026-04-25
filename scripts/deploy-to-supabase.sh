#!/usr/bin/env bash
# One-command cloud deploy: links to your Supabase project, pushes the
# database schema, seeds companies, sets secrets, and deploys all 8
# Edge Functions.
#
# Usage (in Codespaces terminal):
#   bash scripts/deploy-to-supabase.sh <project-ref>
#
# Prerequisites (set once as Codespaces secrets, see SETUP.md):
#   SUPABASE_ACCESS_TOKEN  — from https://supabase.com/dashboard/account/tokens
#   SUPABASE_DB_PASSWORD   — the database password you chose when creating the project
#   ANTHROPIC_API_KEY
#   GOOGLE_CLIENT_ID
#   GOOGLE_CLIENT_SECRET
#   EMAIL_TOKEN_ENCRYPTION_KEY  (run: openssl rand -base64 32)
#   JYRY_ARCHIVE_EMAIL          — optional; BCC address receiving a copy of every
#                                 outgoing application (e.g. archive@jyrygroup.com).
#                                 If unset, sends still work but aren't archived.

set -euo pipefail

PROJECT_REF="${1:-}"
if [ -z "$PROJECT_REF" ]; then
  echo "Usage: bash scripts/deploy-to-supabase.sh <project-ref>"
  echo "Find the project ref in your Supabase dashboard URL:"
  echo "  https://supabase.com/dashboard/project/<project-ref>"
  exit 1
fi

for v in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD ANTHROPIC_API_KEY; do
  if [ -z "${!v:-}" ]; then
    echo "❌ Missing env var: $v"
    echo "   Add it as a Codespaces secret: https://github.com/settings/codespaces"
    exit 1
  fi
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Supabase CLI v2+ is required for Postgres 17 (major_version = 17 in config.toml).
# If the system CLI is v1.x, fall back to npx which always fetches the latest v2.
SUPABASE_MAJOR=$(supabase --version 2>/dev/null | grep -oE '^[0-9]+' || echo 0)
if [ "$SUPABASE_MAJOR" -lt 2 ]; then
  echo "ℹ️  System Supabase CLI is v1.x — using npx supabase@2 for this run."
  supabase() { npx --yes supabase@2 "$@"; }
  export -f supabase
fi

echo "── 0. Building prompt bundle ──"
bash scripts/build-prompts.sh

echo "── 1. Linking to project $PROJECT_REF ──"
supabase link --project-ref "$PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"

echo "── 2. Pushing database migrations ──"
supabase db push --password "$SUPABASE_DB_PASSWORD"

echo "── 3. Seeding companies ──"
PGURI="postgresql://postgres.${PROJECT_REF}:${SUPABASE_DB_PASSWORD}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
psql "$PGURI" -f supabase/seed.sql || echo "(seed may have already run — continuing)"

echo "── 4. Setting Edge Function secrets ──"
supabase secrets set \
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}" \
  GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}" \
  EMAIL_TOKEN_ENCRYPTION_KEY="${EMAIL_TOKEN_ENCRYPTION_KEY:-$(openssl rand -base64 32)}" \
  JYRY_ARCHIVE_EMAIL="${JYRY_ARCHIVE_EMAIL:-}"

echo "── 5. Deploying 8 Edge Functions ──"
# process-upload and process-inbox are triggered by Storage/cron (no user JWT).
for fn in advisor generate-cv generate-letter send-application german-teacher workflow-advance; do
  echo "   · $fn"
  supabase functions deploy "$fn"
done
for fn in process-upload process-inbox; do
  echo "   · $fn (no-verify-jwt)"
  supabase functions deploy "$fn" --no-verify-jwt
done

echo ""
echo "✅ Done."
echo ""
echo "Your Edge Functions are live at:"
echo "   https://${PROJECT_REF}.supabase.co/functions/v1/<function-name>"
echo ""
echo "Your anon key (paste into Framer as NEXT_PUBLIC_SUPABASE_ANON_KEY):"
supabase projects api-keys --project-ref "$PROJECT_REF" | grep anon || true
