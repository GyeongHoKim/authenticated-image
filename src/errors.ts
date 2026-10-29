/** Options for {@link AuthenticatedImageError}. */
export interface AuthenticatedImageErrorOptions {
  /** The `src` that failed to load. */
  src: string;
  /** HTTP status code, when the default fetch received a non-2xx response. */
  status?: number;
  /** The original error thrown by `fetch`, a fetcher or a headers function. */
  cause?: unknown;
}

/** Describes why an `<authenticated-image>` failed to load. */
export class AuthenticatedImageError extends Error {
  override readonly name = 'AuthenticatedImageError';
  /** The `src` that failed to load. */
  readonly src: string;
  /** HTTP status code, when the default fetch received a non-2xx response. */
  readonly status?: number;

  constructor(message: string, options: AuthenticatedImageErrorOptions) {
    super(message, { cause: options.cause });
    this.src = options.src;
    if (options.status !== undefined) this.status = options.status;
  }
}

/** Wraps any thrown value in an {@link AuthenticatedImageError}. */
export function toAuthenticatedImageError(src: string, error: unknown): AuthenticatedImageError {
  if (error instanceof AuthenticatedImageError) return error;
  return new AuthenticatedImageError(`Failed to load image: ${src}`, { src, cause: error });
}
