import { html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { styles } from './authenticated-image.styles';
import type { Fetcher, HeadersProvider } from './config';
import type { AuthenticatedImageError } from './errors';
import { type AuthenticatedImageStatus, ImageLoaderController } from './image-loader-controller';

export type { AuthenticatedImageStatus } from './image-loader-controller';

/** The `error` event of `<authenticated-image>`. */
export type AuthenticatedImageErrorEvent = CustomEvent<{ error: AuthenticatedImageError }>;

// `fetcher` and `headers` are left out on purpose: frameworks such as React assign a new object
// on every render, and they apply on the next load instead.
const RELOAD_TRIGGERS = ['src', 'loading'] as const;

/**
 * An `<img>` that loads its image with `fetch`, so the request can carry an `Authorization`
 * header.
 *
 * @fires load - The image has been decoded and rendered.
 * @fires error - Loading or decoding failed. `event.detail.error` describes why.
 * @slot loading - Shown while the image is loading or waiting to be lazily loaded.
 * @slot error - Shown when the image failed to load.
 * @csspart img - The inner `<img>`.
 * @cssprop --authenticated-image-object-fit - `object-fit` of the inner image. Defaults to `fill`.
 */
export class AuthenticatedImageElement extends LitElement {
  static override styles = styles;

  /** URL of the image. Changing it cancels the current request. */
  @property() src = '';

  /** Alternative text, forwarded to the inner `<img>`. */
  @property() alt = '';

  /** `lazy` waits until the element is within 200px of the viewport before requesting. */
  @property() loading: 'eager' | 'lazy' = 'eager';

  /** Forwarded to the inner `<img>`. */
  @property() decoding: 'async' | 'sync' | 'auto' = 'async';

  /** Width in pixels, forwarded to the inner `<img>`. */
  @property({ type: Number }) width?: number;

  /** Height in pixels, forwarded to the inner `<img>`. */
  @property({ type: Number }) height?: number;

  /**
   * Loads this element's image instead of the global configuration. Disables caching. A new
   * value applies on the next load; call `reload()` to apply it right away.
   */
  @property({ attribute: false }) fetcher?: Fetcher;

  /**
   * Headers for this element's request instead of the global configuration. Disables caching.
   * A new value applies on the next load; call `reload()` to apply it right away.
   */
  @property({ attribute: false }) headers?: HeadersProvider;

  private readonly _loader = new ImageLoaderController(this, {
    overrides: () => this,
    onLoad: () => this.dispatchEvent(new Event('load')),
    onError: (error) => this.dispatchEvent(new CustomEvent('error', { detail: { error } })),
  });

  /** Current loading state. Mirrored to the `status` attribute. */
  get status(): AuthenticatedImageStatus {
    return this._loader.status;
  }

  /** Why the last load failed, or `undefined`. */
  get error(): AuthenticatedImageError | undefined {
    return this._loader.error;
  }

  /** Loads the image again. Elements that use the shared cache skip the cached copy. */
  reload(): void {
    this._loader.reload();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (RELOAD_TRIGGERS.some((key) => changed.has(key))) {
      this._loader.load(this.src, { lazy: this.loading === 'lazy' });
    }
  }

  protected override updated(): void {
    this.setAttribute('status', this._loader.status);
    if (this._loader.busy) this.setAttribute('aria-busy', 'true');
    else this.removeAttribute('aria-busy');
  }

  protected override render(): TemplateResult {
    // Until the image loads, an empty alt keeps the hidden alt text from taking up space.
    const loaded = this._loader.status === 'loaded';
    return html`<img
        part="img"
        ?hidden=${!loaded}
        src=${this._loader.url ?? nothing}
        alt=${loaded ? this.alt : ''}
        decoding=${this.decoding}
        width=${this.width ?? nothing}
        height=${this.height ?? nothing}
        @load=${this._loader.handleImageLoad}
        @error=${this._loader.handleImageError}
      /><slot name="loading" ?hidden=${!this._loader.busy}></slot
      ><slot name="error" ?hidden=${this._loader.status !== 'error'}></slot>`;
  }
}
