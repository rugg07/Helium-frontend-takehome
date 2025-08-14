import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const VALID_LOCALES = ['en', 'es', 'fr', 'de', 'ja', 'zh'] as const;

type Locale = typeof VALID_LOCALES[number];

function toLocale(code: string): Locale | null {
  return (VALID_LOCALES as readonly string[]).includes(code) ? (code as Locale) : null;
}

function extractJsonObject(text: string): Record<string, string> {
  try {
    // Fast path if it is already JSON
    return JSON.parse(text);
  } catch {
    // Try to extract the first {...} block
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found in model response');
    return JSON.parse(match[0]);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const locale = toLocale(String(body?.locale || ''));
    const entries = (body?.entries || {}) as Record<string, string>;

    if (!locale || !entries || typeof entries !== 'object') {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (locale === 'en') {
      // Nothing to translate
      return Response.json({ translations: entries });
    }

    const system = `You are a professional translator. Translate the provided English UI strings to the target language.

Rules:
- Output ONLY a valid JSON object mapping the SAME keys to their translated strings.
- Preserve punctuation, placeholders, HTML or JSX-like tokens (e.g., {name}, <b>text</b>), numbers, and capitalization where appropriate.
- Keep the tone natural for UI labels.
- Do not add, remove, or rename keys.
- Do not include any commentary.`;

    const prompt = `Target language code: ${locale}\n\nJSON to translate (English):\n${JSON.stringify(entries, null, 2)}`;

    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system,
      prompt,
      temperature: 0.2,
    });

    const obj = extractJsonObject(text || '{}');

    // Ensure we only keep known keys and strings
    const safe: Record<string, string> = {};
    for (const [key, enValue] of Object.entries(entries)) {
      const v = obj[key];
      safe[key] = typeof v === 'string' ? v : String(enValue ?? '');
    }

    return Response.json({ translations: safe });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Translation failed';
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}


