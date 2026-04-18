#!/usr/bin/env bash
# Runs once per Codespace after creation.
set -euo pipefail

echo "── Installing Supabase CLI ──"
SUPABASE_VERSION="v1.226.0"
ARCH="$(dpkg --print-architecture)"
curl -fsSL "https://github.com/supabase/cli/releases/download/${SUPABASE_VERSION}/supabase_linux_${ARCH}.tar.gz" \
  | sudo tar -xz -C /usr/local/bin supabase
sudo chmod +x /usr/local/bin/supabase
supabase --version

echo "── Installing pnpm dependencies ──"
corepack enable
pnpm install

echo ""
echo "✅ Codespace ready."
echo ""
echo "Next steps:"
echo "  1. Set your Anthropic + Supabase keys as Codespaces secrets:"
echo "     https://github.com/settings/codespaces"
echo "  2. Read SETUP.md for the full Supabase + Framer wiring guide."
