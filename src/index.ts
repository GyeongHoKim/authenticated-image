import { AuthenticatedImageElement } from './authenticated-image';

export type { AuthenticatedImageErrorEvent, AuthenticatedImageStatus } from './authenticated-image';
export { AuthenticatedImageElement } from './authenticated-image';
export type { AuthenticatedImageConfig, Fetcher, HeadersProvider } from './config';
export { clearCache, configure } from './config';
export type { AuthenticatedImageErrorOptions } from './errors';
export { AuthenticatedImageError } from './errors';

if (!customElements.get('authenticated-image')) {
  customElements.define('authenticated-image', AuthenticatedImageElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'authenticated-image': AuthenticatedImageElement;
  }
}
