/**
 * Local agent runner — invokes an agent's prompt + Claude API directly,
 * without going through Supabase Edge Functions. Useful for iterating on
 * prompts without redeploy.
 *
 * Usage:
 *   pnpm run agent -- <agent> --fixture user-01
 *   pnpm run agent -- generate-cv --fixture user-01
 *   pnpm run agent -- advisor    --fixture user-01
 *   pnpm run agent -- letter     --fixture user-01 --company sap
 */

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const PROMPTS_DIR  = path.join(process.cwd(), "supabase/functions/_prompts");
const FIXTURES_DIR = path.join(process.cwd(), "agents/fixtures");

type AgentKey = "advisor" | "generate-cv" | "letter" | "triage" | "orchestrator" | "teacher";

const AGENT_CONFIG: Record<AgentKey, {
  promptFile: string;
  model: string;
  temperature: number;
  maxTokens: number;
  userMessage: (fx: Fixture, extra: Record<string, string>) => string;
  cachedContext: (fx: Fixture) => string;
}> = {
  advisor: {
    promptFile: "advisor.md",
    model: "claude-opus-4-7",
    temperature: 0.3,
    maxTokens: 2000,
    cachedContext: (fx) => JSON.stringify({ profile: fx.profile, documents: fx.documents }, null, 2),
    userMessage: () => "Bitte analysiere das Profil und empfehle passende Ausbildungsberufe.",
  },
  "generate-cv": {
    promptFile: "cv-generator.md",
    model: "claude-sonnet-4-6",
    temperature: 0.3,
    maxTokens: 2500,
    cachedContext: (fx) => JSON.stringify({ profile: fx.profile, documents: fx.documents }, null, 2),
    userMessage: () => "Erstelle den tabellarischen Lebenslauf für dieses Profil.",
  },
  letter: {
    promptFile: "letter-writer.md",
    model: "claude-sonnet-4-6",
    temperature: 0.5,
    maxTokens: 1800,
    cachedContext: (fx) => JSON.stringify({ profile: fx.profile }, null, 2),
    userMessage: (fx) => `Schreibe das Anschreiben:\n\n${JSON.stringify({
      company: fx.example_company,
      ausbildung_type: fx.profile.target_field,
      earliest_start: fx.earliest_start,
    }, null, 2)}`,
  },
  triage: {
    promptFile: "email-triage.md",
    model: "claude-haiku-4-5-20251001",
    temperature: 0.1,
    maxTokens: 400,
    cachedContext: () => "{}",
    userMessage: (_fx, extra) => extra.email ?? "Subject: Eingangsbestätigung\n\nVielen Dank für Ihre Bewerbung.",
  },
  orchestrator: {
    promptFile: "application-orchestrator.md",
    model: "claude-haiku-4-5-20251001",
    temperature: 0.2,
    maxTokens: 600,
    cachedContext: () => "{}",
    userMessage: (fx) => JSON.stringify({
      company: fx.example_company,
      applicant: fx.profile,
      letter_subject: "Bewerbung um einen Ausbildungsplatz",
    }, null, 2),
  },
  teacher: {
    promptFile: "german-teacher.md",
    model: "claude-sonnet-4-6",
    temperature: 0.6,
    maxTokens: 500,
    cachedContext: (fx) => JSON.stringify({
      german_level: fx.profile.german_level, target_field: fx.profile.target_field,
      ui_language: "ar", mode: "interview_prep",
    }, null, 2),
    userMessage: () => "Learner: Ich will als Fachinformatiker lernen. Kannst du mich vorbereiten?",
  },
};

interface Fixture {
  profile: {
    full_name: string; german_level: string; target_field: string; [k: string]: unknown;
  };
  documents: unknown[];
  example_company: { name: string; email: string; [k: string]: unknown };
  earliest_start: string;
}

function parseArgs(argv: string[]): { agent: AgentKey; fixture: string; extra: Record<string,string> } {
  const agent = argv[0] as AgentKey;
  if (!agent || !(agent in AGENT_CONFIG)) {
    console.error(`Usage: pnpm run agent -- <${Object.keys(AGENT_CONFIG).join("|")}> --fixture <name>`);
    process.exit(1);
  }
  const extra: Record<string,string> = {};
  let fixture = "user-01";
  for (let i = 1; i < argv.length; i++) {
    const k = argv[i]; const v = argv[i + 1];
    if (k === "--fixture" && v) { fixture = v; i++; }
    else if (k?.startsWith("--") && v) { extra[k.slice(2)] = v; i++; }
  }
  return { agent, fixture, extra };
}

async function main() {
  const { agent, fixture, extra } = parseArgs(process.argv.slice(2));
  const cfg = AGENT_CONFIG[agent];
  const prompt = fs.readFileSync(path.join(PROMPTS_DIR, cfg.promptFile), "utf8");
  const fx = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, `${fixture}.json`), "utf8")) as Fixture;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY in env (.env.local).");
    process.exit(1);
  }

  const client = new Anthropic();
  console.log(`▶ ${agent} (${cfg.model}) fixture=${fixture}`);

  const started = Date.now();
  const res = await client.messages.create({
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    temperature: cfg.temperature,
    system: [
      { type: "text", text: prompt, cache_control: { type: "ephemeral" } },
      { type: "text", text: cfg.cachedContext(fx), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: cfg.userMessage(fx, extra) }],
  });

  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
  console.log("\n──────── output ────────\n");
  console.log(text);
  console.log(`\n──────── usage ────────`);
  console.log({ ...res.usage, duration_ms: Date.now() - started, stop_reason: res.stop_reason });
}

main().catch((e) => { console.error(e); process.exit(1); });
