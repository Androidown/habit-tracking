/** Auth service — register API */

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface ApiErrorField {
  field: string;
  reason: string;
}

/** Standard API response envelope matching the Go backend. */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

export interface RegisterSuccessData {
  user_id: string;
  email: string;
  username: string;
  created_at: string;
}

/**
 * Error subclass for structured API errors.
 * - `fields`: per-field validation errors from 422 responses.
 * - `isConflict`: true when the email is already registered (409).
 */
export class AuthApiError extends Error {
  fields: ApiErrorField[];
  isConflict: boolean;

  constructor(
    message: string,
    options: { fields?: ApiErrorField[]; isConflict?: boolean } = {},
  ) {
    super(message);
    this.name = 'AuthApiError';
    this.fields = options.fields ?? [];
    this.isConflict = options.isConflict ?? false;
  }
}

/** Error type for network-level failures (timeout, unreachable). */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Call the register API.
 *
 * Returns the response data on success.
 * Throws `AuthApiError` on 422/409.
 * Throws `NetworkError` on network failures.
 */
export async function register(req: RegisterRequest): Promise<RegisterSuccessData> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new NetworkError('网络连接异常，请稍后重试');
    }
    throw new NetworkError('网络连接异常，请稍后重试');
  }

  const body: ApiResponse = await response.json();

  if (response.status === 201 && body.code === 0) {
    return body.data as RegisterSuccessData;
  }

  if (response.status === 422 || body.code === 1001) {
    const fields: ApiErrorField[] = Array.isArray(body.data)
      ? (body.data as ApiErrorField[])
      : [];
    throw new AuthApiError(body.message ?? 'VALIDATION_ERROR', { fields });
  }

  if (response.status === 409 || body.code === 1002) {
    throw new AuthApiError(body.message ?? 'EMAIL_ALREADY_EXISTS', {
      isConflict: true,
    });
  }

  throw new AuthApiError(body.message ?? '未知错误');
}
