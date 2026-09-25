// Normalised API errors. Laravel returns `{ message, errors?: { field: string[] } }` for failures.
export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldErrors;
  readonly code: string | undefined;

  constructor(status: number, message: string, fieldErrors: FieldErrors = {}, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.code = code;
  }

  get isValidation() {
    return this.status === 422;
  }
  get isUnauthenticated() {
    return this.status === 401 || this.status === 419;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
  /** First message for a field (field names are camelCase). */
  field(name: string) {
    return this.fieldErrors[name]?.[0];
  }
}

export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Can’t reach the server. Check your connection and try again.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/** Human-readable message for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError || err instanceof NetworkError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
