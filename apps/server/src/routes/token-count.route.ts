import type { FastifyInstance } from 'fastify';

interface TokenCountResponse {
  total_tokens: number;
}

function estimateTokensForContent(content: string | Array<{ type: string; [k: string]: unknown }>): number {
  if (typeof content === 'string') {
    // Anthropic uses ~4 chars per token for text, plus 3 tokens base per message
    return Math.ceil(content.length / 4) + 3;
  }

  if (Array.isArray(content)) {
    let tokens = 0;
    for (const block of content) {
      switch (block.type) {
        case 'text':
          tokens += estimateTokensForContent(typeof block.text === 'string' ? block.text : '');
          break;
        case 'image':
          tokens += 850; // Anthropic image token cost per block
          break;
        case 'tool_use':
          tokens += 16 + 3; // Base tool_use cost + input estimation
          break;
        default:
          tokens += 1; // Unknown block type
      }
    }
    return tokens + 3; // Base per-message cost
  }

  return 3; // Default base
}

export function countTokens(messages: Array<{ role: string; content: unknown }>): TokenCountResponse {
  let totalTokens = 0;

  for (const msg of messages) {
    const contentTokens = estimateTokensForContent(msg.content as string | Array<{ type: string; [k: string]: unknown }>);
    totalTokens += contentTokens;

    // Tool messages add overhead
    if (msg.role === 'tool') {
      totalTokens += 3;
    }
  }

  return { total_tokens: totalTokens };
}

// Bütün context: mesajlar + sistem prompt'u + tool tanımları
export function estimateContextTokens(body: {
  messages: Array<{ role: string; content: unknown }>;
  system?: unknown;
  tools?: unknown;
}): number {
  const extra =
    (body.system === undefined ? 0 : JSON.stringify(body.system).length) +
    (body.tools === undefined ? 0 : JSON.stringify(body.tools).length);
  return countTokens(body.messages).total_tokens + Math.ceil(extra / 4);
}

export async function register(app: FastifyInstance) {
  app.post('/v1/messages/count_tokens', async (req) => {
    const messages = req.body as { messages?: Array<{ role: string; content: unknown }> };
    if (!messages?.messages || !Array.isArray(messages.messages)) {
      return { total_tokens: 0 };
    }

    return countTokens(messages.messages);
  });
}
