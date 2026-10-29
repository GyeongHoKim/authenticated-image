import { createElement } from 'react';
import {
  type AuthenticatedImageElement,
  AuthenticatedImageError,
  type AuthenticatedImageStatus,
  clearCache,
  configure,
  type Fetcher,
} from '../dist/index.mjs';
import { AuthenticatedImage } from '../dist/react.mjs';

export const fetcher: Fetcher = async (src, { signal }) => {
  const response = await fetch(src, { signal });
  return response.blob();
};

export const presignedFetcher: Fetcher = async () => 'https://example.com/signed.png';

export function setUp(): void {
  configure({ fetcher, cache: { retainMs: 0 } });
  configure({ headers: async () => ({ Authorization: 'Bearer token' }) });
  clearCache();
}

export function useElement(): AuthenticatedImageStatus {
  const element: AuthenticatedImageElement = document.createElement('authenticated-image');
  element.src = '/api/image';
  element.loading = 'lazy';
  element.headers = { Authorization: 'Bearer token' };
  element.reload();
  // @ts-expect-error loading only accepts 'eager' or 'lazy'
  element.loading = 'later';
  return element.status;
}

export const status: number | undefined = new AuthenticatedImageError('failed', {
  src: '/api/image',
  status: 401,
}).status;

export const reactElement = createElement(AuthenticatedImage, {
  src: '/api/image',
  alt: 'Image',
  onError: (event) => {
    const error: AuthenticatedImageError = event.detail.error;
    return error;
  },
});
