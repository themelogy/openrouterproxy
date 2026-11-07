import { z } from 'zod';

export const MessageRequestSchema = z.object({
  model: z.string(),
  messages: z.array(z.any()).min(1),
  stream: z.boolean().optional().default(false),
  max_tokens: z.number().int().min(1).optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  stop_sequences: z.array(z.string()).optional(),
  system: z.any().optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional(),
}).passthrough();

export type ZodMessageRequest = z.infer<typeof MessageRequestSchema>;

const STRIP_KEYS = new Set(['metadata', 'thinking', 'context_management', 'output_config']);

export function stripAnthropicFields(body: ZodMessageRequest): Record<string, unknown> {
  const stripped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!STRIP_KEYS.has(k)) stripped[k] = v;
  }
  return stripped;
}
