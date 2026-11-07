export interface AnthropicErrorResponse {
  error: { type: string; message: string; code?: number };
}

const STATUS_MAP: Record<number, { type: string; message: string }> = {
  401: { type: 'unauthenticated_error', message: 'OpenRouter authentication failed' },
  403: { type: 'permission_error', message: 'Permission denied by OpenRouter' },
  429: { type: 'rate_limit_error', message: 'Rate limited by OpenRouter' },
  500: { type: 'server_error', message: 'OpenRouter server error' },
  502: { type: 'upstream_error', message: 'Upstream request failed' },
  503: { type: 'upstream_error', message: 'Upstream service unavailable' },
  504: { type: 'timeout_error', message: 'Request timed out' },
};

export function mapOpenRouterError(status: number, _body: unknown): AnthropicErrorResponse {
  const mapped = STATUS_MAP[status];
  if (mapped) return { error: mapped };
  return { error: { type: 'upstream_error', message: `Upstream error ${status}` } };
}

export function normalizeOpenRouterError(body: unknown): AnthropicErrorResponse | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error: unknown }).error;
    if (err && typeof err === 'object') return body as AnthropicErrorResponse;
  }
  return null;
}
