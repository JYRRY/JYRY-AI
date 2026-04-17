import Anthropic from "npm:@anthropic-ai/sdk@0.40.0";
import { serviceClient } from "./supabase.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

export type ClaudeModel =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001";

// Per-million token prices (USD) — Apr 2026.
const PRICING: Record<ClaudeModel, { in: number; out: number; cacheWrite: number; cacheRead: number }> = {
  "claude-opus-4-7":           { in: 15.00, out: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  "claude-sonnet-4-6":         { in:  3.00, out: 15.00, cacheWrite:  3.75, cacheRead: 0.30 },
  "claude-haiku-4-5-20251001": { in:  1.00, out:  5.00, cacheWrite:  1.25, cacheRead: 0.10 },
};

export interface RunClaudeParams {
  agent: string;
  userId: string;
  model: ClaudeModel;
  /** Cached. System prompt string; we automatically add cache_control. */
  system: string;
  /** Cached second block (usually the user profile JSON). Optional. */
  cachedContext?: string;
  /** Non-cached, per-call user message. */
  user: string;
  maxTokens?: number;
  temperature?: number;
  tools?: Anthropic.Tool[];
}

export interface RunClaudeResult {
  text: string;
  stopReason: string | null;
  toolUses: Anthropic.ToolUseBlock[];
  agentRunId: string;
}

/**
 * Single entry point for every Claude call.
 * - Applies prompt caching to the system prompt (+ optional cachedContext).
 * - Retries once on 429/529 with exponential backoff.
 * - Logs every call to `agent_runs` with tokens + cost.
 */
export async function runClaude(params: RunClaudeParams): Promise<RunClaudeResult> {
  const started = Date.now();
  const db = serviceClient();
  const maxTokens = params.maxTokens ?? 2048;

  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: params.system, cache_control: { type: "ephemeral" } },
  ];
  if (params.cachedContext) {
    systemBlocks.push({
      type: "text",
      text: params.cachedContext,
      cache_control: { type: "ephemeral" },
    });
  }

  let attempt = 0;
  let lastErr: unknown;
  while (attempt < 3) {
    try {
      const res = await anthropic.messages.create({
        model: params.model,
        max_tokens: maxTokens,
        temperature: params.temperature ?? 0.4,
        system: systemBlocks,
        tools: params.tools,
        messages: [{ role: "user", content: params.user }],
      });

      const usage = res.usage;
      const price = PRICING[params.model];
      const cost =
        (usage.input_tokens         / 1_000_000) * price.in +
        (usage.output_tokens        / 1_000_000) * price.out +
        ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * price.cacheWrite +
        ((usage.cache_read_input_tokens     ?? 0) / 1_000_000) * price.cacheRead;

      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const toolUses = res.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      const { data: run } = await db.from("agent_runs").insert({
        user_id:            params.userId,
        agent:              params.agent,
        model:              params.model,
        input_tokens:       usage.input_tokens,
        output_tokens:      usage.output_tokens,
        cache_read_tokens:  usage.cache_read_input_tokens ?? 0,
        cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
        cost_usd:           cost.toFixed(6),
        duration_ms:        Date.now() - started,
        status:             "ok",
      }).select("id").single();

      return {
        text,
        stopReason: res.stop_reason,
        toolUses,
        agentRunId: run?.id ?? "",
      };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 529) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        attempt++;
        continue;
      }
      break;
    }
  }

  await db.from("agent_runs").insert({
    user_id: params.userId,
    agent: params.agent,
    model: params.model,
    status: "error",
    error_message: (lastErr as Error)?.message ?? String(lastErr),
    duration_ms: Date.now() - started,
  });
  throw lastErr;
}

/**
 * Extract the first JSON object from a Claude text response.
 * Claude often wraps JSON in ```json fences; this strips them.
 */
export function extractJson<T>(text: string): T {
  const match = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  const raw = match ? match[1] : text;
  return JSON.parse(raw);
}
