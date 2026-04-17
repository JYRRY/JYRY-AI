/**
 * Prompts live as Markdown under /agents/prompts so non-engineers can edit
 * them. Edge Functions read the text at cold start; changes require redeploy.
 * The files are copied into each Function's directory at deploy time by
 * scripts/deploy-functions.sh; locally, `supabase functions serve` resolves
 * the relative path from the function's own directory.
 */
export function loadPrompt(name: string): string {
  const url = new URL(`../_prompts/${name}.md`, import.meta.url);
  return Deno.readTextFileSync(url);
}
