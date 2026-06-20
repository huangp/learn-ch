import { StoryJsonSchema, type StoryJson } from './types';

/** Thrown when raw LLM output can't be parsed into a valid StoryJson. The message
 *  is repair-friendly (cites the JSON or schema problem) so it can be fed back. */
export class StoryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoryParseError';
  }
}

/** Strip a leading/trailing markdown code fence if the model wrapped its JSON. */
function stripFence(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith('```')) return t;
  return t
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

/** Parse + structurally validate raw LLM output into a StoryJson (§8.5 contract). */
export function parseStoryJson(raw: string): StoryJson {
  const text = stripFence(raw);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new StoryParseError(`Output is not valid JSON: ${(e as Error).message}`);
  }
  const result = StoryJsonSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new StoryParseError(`JSON does not match the required schema: ${issues}`);
  }
  return result.data;
}
