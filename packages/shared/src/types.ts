import { z } from 'zod';

// Core message types matching Anthropic Messages API shape
export interface MessageRequest {
  model: string;
  messages: Array<{ role: string; content: unknown }>;
  stream?: boolean;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  system?: string | Array<{ type: string; [k: string]: unknown }>;
  tools?: Array<{ type: string; [k: string]: unknown }>;
  tool_choice?: Record<string, unknown>;
}

export interface ContentBlock {
  type: string;
  [k: string]: unknown;
}

export interface MessageResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ContentBlock[];
  model: string;
  stop_reason?: string;
  stop_sequence?: string | null;
}

export interface ErrorResponse {
  error: {
    type: string;
    message: string;
    code?: number;
  };
}

// Config types
export interface ServerConfig {
  host: string;
  port: number;
  timeoutMs: number;
}

export interface SecurityConfig {
  localAuthToken?: string;
  allowRemote?: boolean;
}

export interface OpenRouterConfig {
  baseUrl: string;
  apiKey: string;
}

/** OpenRouter provider routing options — see https://openrouter.ai/docs/provider-routing */
export interface ProviderOptions {
  /** Sort providers by price or throughput */
  sort?: 'price' | 'throughput';
  /** Only use these providers (list of provider slugs) */
  only?: string[];
  /** Ignore these providers (list of provider slugs) */
  ignore?: string[];
  /** Disable fallback to other providers when primary fails */
  allowFallbacks?: boolean;
}

export interface ModelConfigEntry {
  /** OpenRouter model ID, e.g. "anthropic/claude-3.5-sonnet" */
  id: string;
  /** Optional provider routing configuration */
  providerOptions?: ProviderOptions;
}

export type ModelConfigValue = string | ModelConfigEntry;

export interface ModelConfig {
  opus: ModelConfigValue;
  sonnet: ModelConfigValue;
  haiku: ModelConfigValue;
}

export interface AppConfig {
  server: ServerConfig;
  openrouter: OpenRouterConfig;
  models: ModelConfig;
  security?: SecurityConfig;
}

export const DEFAULT_CONFIG: AppConfig = {
  server: { host: '127.0.0.1', port: 4000, timeoutMs: 3_000_000 },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: '' },
  models: { opus: '', sonnet: '', haiku: '' },
};

// Zod schemas
export const ProviderOptionsSchema = z.object({
  sort: z.enum(['price', 'throughput']).optional(),
  only: z.array(z.string()).optional(),
  ignore: z.array(z.string()).optional(),
  allowFallbacks: z.boolean().optional(),
}).passthrough();

export const ModelConfigEntrySchema = z.object({
  id: z.string(),
  providerOptions: ProviderOptionsSchema.optional(),
}).passthrough();

export const ModelConfigSchema = z.object({
  opus: z.union([z.string(), ModelConfigEntrySchema]),
  sonnet: z.union([z.string(), ModelConfigEntrySchema]),
  haiku: z.union([z.string(), ModelConfigEntrySchema]),
}).passthrough();

export const ServerConfigSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.number().int().min(1).max(65535).default(4000),
  timeoutMs: z.number().int().min(1000).default(3_000_000),
}).passthrough();

export const OpenRouterConfigSchema = z.object({
  baseUrl: z.string().url().default('https://openrouter.ai/api/v1'),
  apiKey: z.string(),
}).passthrough();

export const SecurityConfigSchema = z.object({
  localAuthToken: z.string().optional(),
  allowRemote: z.boolean().default(false),
}).passthrough();

export const AppConfigSchema = z.object({
  server: ServerConfigSchema,
  openrouter: OpenRouterConfigSchema,
  models: ModelConfigSchema,
  security: SecurityConfigSchema.optional(),
}).passthrough();

export type ZodAppConfig = z.infer<typeof AppConfigSchema>;
