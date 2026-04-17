import OpenAI from "npm:openai@4.73.0";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

/** text-embedding-3-small: 1536 dims, cheap, good quality for German/English/Arabic. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

/** OCR + structured extraction using GPT-4.1 mini vision. Returns JSON. */
export async function extractFromImage(imageBase64: string, mime: string, hint: string): Promise<unknown> {
  const res = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You extract structured data from German Ausbildung-related documents. " +
          "Return ONLY valid JSON matching the user's requested schema. Do not translate names or grades.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: hint },
          { type: "image_url", image_url: { url: `data:${mime};base64,${imageBase64}` } },
        ],
      },
    ],
  });
  const text = res.choices[0]?.message.content ?? "{}";
  return JSON.parse(text);
}
