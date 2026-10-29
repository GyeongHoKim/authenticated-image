import { AuthenticatedImageError } from './errors';
import { ImageCache } from './image-cache';

/**
 * Loads an image. Resolve to a `Blob` to display it through an object URL, or to a string
 * (such as a presigned URL) to use it as `img.src` directly.
 */
export type Fetcher = (src: string, context: { signal: AbortSignal }) => Promise<Blob | string>;

/** Headers for the default fetch, or a function that returns them. */
export type HeadersProvider = HeadersInit | (() => HeadersInit | Promise<HeadersInit>);

/** Global configuration for every `<authenticated-image>`. */
export interface AuthenticatedImageConfig {
  /** Loads images. Takes precedence over `headers`. */
  fetcher?: Fetcher;
  /** Headers sent with the default `fetch`. */
  headers?: HeadersProvider;
  cache?: {
    /**
     * How long an unused image stays in memory, in milliseconds. `0` releases it immediately,
     * and `Infinity` keeps it until the cache is cleared.
     * @defaultValue 30000
     */
    retainMs?: number;
  };
}

/** Default value of `cache.retainMs`. */
export const DEFAULT_RETAIN_MS = 30_000;

/** The cache shared by elements that use the global configuration. */
export const imageCache = new ImageCache(DEFAULT_RETAIN_MS);

let globalConfig: AuthenticatedImageConfig = {};

/**
 * Replaces the global configuration and clears the cache.
 *
 * @example
 * ```ts
 * configure({
 *   headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
 * });
 * ```
 */
export function configure(config: AuthenticatedImageConfig): void {
  globalConfig = { ...config };
  imageCache.setRetainMs(config.cache?.retainMs ?? DEFAULT_RETAIN_MS);
  imageCache.detachAll();
}

/**
 * Clears the shared cache, for example on logout. Images on screen stay visible; new
 * elements fetch again.
 */
export function clearCache(): void {
  imageCache.detachAll();
}

/** Element-level settings that override the global configuration. */
export interface LoaderOverrides {
  readonly fetcher?: Fetcher | undefined;
  readonly headers?: HeadersProvider | undefined;
}

/** How an element loads its image. */
export interface ResolvedLoader {
  load(src: string, signal: AbortSignal): Promise<Blob | string>;
  /** `false` when element-level settings are used, so their results never enter the cache. */
  readonly cacheable: boolean;
}

/** Fetches `src` with the given headers and resolves to the response body. */
export async function defaultFetch(
  src: string,
  headers: HeadersProvider | undefined,
  signal: AbortSignal,
): Promise<Blob> {
  const init = typeof headers === 'function' ? await headers() : headers;
  const response = await fetch(src, { headers: init, signal, credentials: 'same-origin' });
  if (!response.ok) {
    throw new AuthenticatedImageError(`Request failed with status ${response.status}: ${src}`, {
      src,
      status: response.status,
    });
  }
  return response.blob();
}

function fromFetcher(fetcher: Fetcher): ResolvedLoader['load'] {
  return (src, signal) => fetcher(src, { signal });
}

function fromHeaders(headers: HeadersProvider | undefined): ResolvedLoader['load'] {
  return (src, signal) => defaultFetch(src, headers, signal);
}

/**
 * Picks the loader for an element. Precedence: element `fetcher`, element `headers`, global
 * `fetcher`, global `headers`, then a plain fetch.
 */
export function resolveLoader(overrides: LoaderOverrides): ResolvedLoader {
  if (overrides.fetcher) return { load: fromFetcher(overrides.fetcher), cacheable: false };
  if (overrides.headers !== undefined) {
    return { load: fromHeaders(overrides.headers), cacheable: false };
  }
  if (globalConfig.fetcher) return { load: fromFetcher(globalConfig.fetcher), cacheable: true };
  return { load: fromHeaders(globalConfig.headers), cacheable: true };
}
