import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { imageCache, type LoaderOverrides, resolveLoader } from './config';
import { AuthenticatedImageError, toAuthenticatedImageError } from './errors';
import { type CacheLease, type ImageUrl, revokeImageUrl, toImageUrl } from './image-cache';
import { LazyController } from './lazy-controller';

/** Loading state of an `<authenticated-image>`. */
export type AuthenticatedImageStatus = 'idle' | 'loading' | 'loaded' | 'error';

/** How an {@link ImageLoaderController} loads its image and reports the outcome. */
export interface ImageLoaderOptions {
  /** Read on every load, so a new `fetcher` or `headers` applies on the next load. */
  overrides(): LoaderOverrides;
  /** The image has been decoded and rendered. */
  onLoad(): void;
  /** Loading or decoding failed. Not called for aborted requests. */
  onError(error: AuthenticatedImageError): void;
}

/**
 * Loads an image for its host and owns everything the load holds: the request, the cache lease
 * and the object URL. Starting a new load or disconnecting the host releases them, and results
 * that arrive after that are dropped.
 */
export class ImageLoaderController implements ReactiveController {
  readonly #host: ReactiveControllerHost & Element;
  readonly #options: ImageLoaderOptions;
  readonly #lazy: LazyController;

  #src = '';
  #lazyLoad = false;
  #status: AuthenticatedImageStatus = 'idle';
  #url?: string;
  #error?: AuthenticatedImageError;
  #generation = 0;
  #needsStart = true;
  #retried = false;
  #controller?: AbortController;
  #lease?: CacheLease;
  #ownedImage?: ImageUrl;
  #image?: ImageUrl;

  constructor(host: ReactiveControllerHost & Element, options: ImageLoaderOptions) {
    this.#host = host;
    this.#options = options;
    this.#lazy = new LazyController(host);
    host.addController(this);
  }

  get status(): AuthenticatedImageStatus {
    return this.#status;
  }

  /** URL for the inner `<img>`, set once the loader resolves. */
  get url(): string | undefined {
    return this.#url;
  }

  /** Why the last load failed, or `undefined`. */
  get error(): AuthenticatedImageError | undefined {
    return this.#error;
  }

  /** Whether the image is loading or waiting to be lazily loaded. */
  get busy(): boolean {
    return this.#status === 'loading' || this.#lazy.waiting;
  }

  /**
   * Loads `src` on the host's next update and cancels the current load. With `lazy`, the request
   * waits until the host comes near the viewport.
   */
  load(src: string, { lazy = false }: { lazy?: boolean } = {}): void {
    this.#src = src;
    this.#lazyLoad = lazy;
    this.#needsStart = true;
    this.#host.requestUpdate();
  }

  /** Loads the image again. A shared cached copy is skipped. */
  reload(): void {
    this.#lease?.detach();
    if (!this.#host.isConnected) {
      this.#needsStart = true;
      return;
    }
    this.#start();
  }

  /** Handles the inner `<img>`'s `load` event. Bound, so it can be passed to `@load`. */
  readonly handleImageLoad = (): void => {
    if (!this.#image) return;
    this.#status = 'loaded';
    this.#host.requestUpdate();
    this.#options.onLoad();
  };

  /** Handles the inner `<img>`'s `error` event. Bound, so it can be passed to `@error`. */
  readonly handleImageError = (): void => {
    if (!this.#image) return;
    const src = this.#src;
    this.#lease?.detach();

    // A string result is usually a presigned URL that may have expired, so ask once more.
    if (!this.#image.isObjectUrl && !this.#retried) {
      this.#retried = true;
      const generation = this.#generation;
      this.#releaseResources();
      this.#host.requestUpdate();
      // Wait for the render that clears img.src, so an identical URL still triggers a new load.
      void this.#host.updateComplete.then(() => this.#load(generation));
      return;
    }
    this.#fail(new AuthenticatedImageError(`Failed to decode image: ${src}`, { src }));
  };

  hostConnected(): void {
    this.#needsStart = true;
    this.#host.requestUpdate();
  }

  hostUpdate(): void {
    if (this.#needsStart && this.#host.isConnected) {
      this.#needsStart = false;
      this.#start();
    }
  }

  hostDisconnected(): void {
    this.#cleanup();
    this.#status = 'idle';
    this.#host.requestUpdate();
  }

  #start(): void {
    this.#cleanup();
    this.#error = undefined;
    this.#retried = false;
    this.#status = 'idle';
    this.#host.requestUpdate();
    if (!this.#src) return;
    const generation = this.#generation;
    if (this.#lazyLoad) {
      this.#lazy.whenVisible(() => void this.#load(generation));
      return;
    }
    void this.#load(generation);
  }

  async #load(generation: number): Promise<void> {
    if (generation !== this.#generation) return;
    const src = this.#src;
    const loader = resolveLoader(this.#options.overrides());
    this.#status = 'loading';
    this.#host.requestUpdate();

    let image: ImageUrl;
    try {
      if (loader.cacheable) {
        const lease = imageCache.acquire(src, (signal) => loader.load(src, signal));
        this.#lease = lease;
        image = await lease.image;
      } else {
        const controller = new AbortController();
        this.#controller = controller;
        image = toImageUrl(await loader.load(src, controller.signal));
        if (generation !== this.#generation) {
          revokeImageUrl(image);
          return;
        }
        this.#ownedImage = image;
      }
    } catch (error) {
      if (generation === this.#generation) this.#fail(toAuthenticatedImageError(src, error));
      return;
    }
    if (generation !== this.#generation) return;
    this.#image = image;
    this.#url = image.url;
    this.#host.requestUpdate();
  }

  #fail(error: AuthenticatedImageError): void {
    this.#releaseResources();
    this.#error = error;
    this.#status = 'error';
    this.#host.requestUpdate();
    this.#options.onError(error);
  }

  #releaseResources(): void {
    this.#controller?.abort();
    this.#controller = undefined;
    this.#lease?.release();
    this.#lease = undefined;
    if (this.#ownedImage) {
      revokeImageUrl(this.#ownedImage);
      this.#ownedImage = undefined;
    }
    this.#image = undefined;
    this.#url = undefined;
  }

  #cleanup(): void {
    this.#generation++;
    this.#lazy.cancel();
    this.#releaseResources();
  }
}
