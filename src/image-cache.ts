/** A loaded image, ready to be assigned to `img.src`. */
export interface ImageUrl {
  /** An object URL for blobs, or the string the loader returned. */
  readonly url: string;
  /** Whether `url` was created by `URL.createObjectURL` and must be revoked. */
  readonly isObjectUrl: boolean;
}

/** Converts a loader result into a displayable URL. */
export function toImageUrl(result: unknown): ImageUrl {
  if (typeof result === 'string') return { url: result, isObjectUrl: false };
  if (result instanceof Blob) return { url: URL.createObjectURL(result), isObjectUrl: true };
  throw new TypeError('Expected the image loader to resolve to a Blob or a string.');
}

/** Revokes the object URL of an image. Strings are left untouched. */
export function revokeImageUrl(image: ImageUrl): void {
  if (image.isObjectUrl) URL.revokeObjectURL(image.url);
}

/** Loads one image. The signal aborts when nobody needs the result anymore. */
export type ImageLoader = (signal: AbortSignal) => Promise<unknown>;

/** A reference to a cached image. Call `release` once the image is no longer displayed. */
export interface CacheLease {
  readonly image: Promise<ImageUrl>;
  release(): void;
  /**
   * Stops sharing the entry this lease holds, so the next acquire loads again. Does nothing if
   * that entry was already detached or replaced. The lease keeps its image until released.
   */
  detach(): void;
}

/** The largest delay `setTimeout` accepts. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** Maps `retainMs` to a timer delay. `Infinity` means the entry never expires. */
function normalizeRetainMs(retainMs: number): number {
  if (Number.isNaN(retainMs) || retainMs <= 0) return 0;
  if (retainMs > MAX_TIMEOUT_MS) return Number.POSITIVE_INFINITY;
  return retainMs;
}

interface Entry {
  readonly key: string;
  readonly controller: AbortController;
  readonly image: Promise<ImageUrl>;
  loaded?: ImageUrl;
  refCount: number;
  settled: boolean;
  detached: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * In-memory image cache keyed by `src`. Concurrent requests for the same key share one load,
 * and an entry is revoked `retainMs` after its last lease is released. A `retainMs` that is not
 * finite or exceeds the `setTimeout` limit keeps entries until they are detached; `NaN` and
 * negative values mean `0`.
 */
export class ImageCache {
  readonly #entries = new Map<string, Entry>();
  #retainMs: number;

  constructor(retainMs: number) {
    this.#retainMs = normalizeRetainMs(retainMs);
  }

  /** Number of entries that new leases can still join. */
  get size(): number {
    return this.#entries.size;
  }

  setRetainMs(retainMs: number): void {
    this.#retainMs = normalizeRetainMs(retainMs);
  }

  acquire(key: string, loader: ImageLoader): CacheLease {
    let entry = this.#entries.get(key);
    if (!entry) {
      entry = this.#create(key, loader);
      this.#entries.set(key, entry);
    }
    if (entry.timer !== undefined) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
    entry.refCount++;

    const acquired = entry;
    let released = false;
    return {
      image: acquired.image,
      release: () => {
        if (released) return;
        released = true;
        this.#release(acquired);
      },
      detach: () => {
        if (!acquired.detached) this.#detach(acquired);
      },
    };
  }

  /** Stops sharing every entry. */
  detachAll(): void {
    for (const entry of [...this.#entries.values()]) this.#detach(entry);
  }

  #create(key: string, loader: ImageLoader): Entry {
    const controller = new AbortController();
    // Assigned below; the async body only reads it after its first await.
    let entry!: Entry;
    const image = (async () => {
      try {
        // Defer the loader so `entry` is initialized even if it throws synchronously.
        const result = await Promise.resolve().then(() => loader(controller.signal));
        const loaded = toImageUrl(result);
        entry.settled = true;
        if (controller.signal.aborted) {
          revokeImageUrl(loaded);
          throw new DOMException('The image request was aborted.', 'AbortError');
        }
        entry.loaded = loaded;
        return loaded;
      } catch (error) {
        entry.settled = true;
        this.#detach(entry);
        throw error;
      }
    })();
    // Leases handle rejections; this keeps an abandoned entry from reporting an unhandled one.
    image.catch(() => {});

    entry = { key, controller, image, refCount: 0, settled: false, detached: false };
    return entry;
  }

  #release(entry: Entry): void {
    entry.refCount--;
    if (entry.refCount > 0) return;
    if (!entry.settled) {
      entry.controller.abort();
      this.#detach(entry);
      return;
    }
    if (entry.detached || this.#retainMs === 0) {
      this.#dispose(entry);
      return;
    }
    if (this.#retainMs === Number.POSITIVE_INFINITY) return;
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      this.#dispose(entry);
    }, this.#retainMs);
  }

  #detach(entry: Entry): void {
    entry.detached = true;
    if (this.#entries.get(entry.key) === entry) this.#entries.delete(entry.key);
    if (entry.refCount === 0) this.#dispose(entry);
  }

  #dispose(entry: Entry): void {
    if (entry.timer !== undefined) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
    if (this.#entries.get(entry.key) === entry) this.#entries.delete(entry.key);
    if (entry.loaded) {
      revokeImageUrl(entry.loaded);
      entry.loaded = undefined;
    }
  }
}
