import OpenAI from "npm:openai@4.73.0";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

/** text-embedding-3-small: 1536 dims, cheap, good quality for German/English/Arabic.
 *  OpenAI is used here solely for embeddings — Claude has no embedding API.
 *  All reasoning/generation agents use Claude exclusively.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}
