/**
 * Prompts live as Markdown under supabase/functions/_prompts so non-engineers
 * can edit them. Supabase Edge Functions do not bundle non-.ts files reliably,
 * so scripts/build-prompts.sh compiles the .md files into prompts-data.ts at
 * deploy time. The Node CLI still reads the raw .md files directly.
 */
import { PROMPTS } from "./prompts-data.ts";

export function loadPrompt(name: string): string {
  const text = PROMPTS[name];
  if (!text) throw new Error(`Prompt not found: ${name}`);
  return text;
}
