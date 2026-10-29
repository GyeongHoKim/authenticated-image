'use client';

import { createComponent, type EventName } from '@lit/react';
import * as React from 'react';
import { AuthenticatedImageElement, type AuthenticatedImageErrorEvent } from './index';

/**
 * React component for `<authenticated-image>`. Props map to the element's properties, and
 * `onLoad` / `onError` map to its events. `ref` points to the {@link AuthenticatedImageElement}.
 *
 * @example
 * ```tsx
 * <AuthenticatedImage src="/api/avatar" alt="Avatar" onError={(e) => console.warn(e.detail.error)} />
 * ```
 */
export const AuthenticatedImage = createComponent({
  tagName: 'authenticated-image',
  elementClass: AuthenticatedImageElement,
  react: React,
  events: {
    onLoad: 'load' as EventName<Event>,
    onError: 'error' as EventName<AuthenticatedImageErrorEvent>,
  },
  displayName: 'AuthenticatedImage',
});

export type {
  AuthenticatedImageConfig,
  AuthenticatedImageElement,
  AuthenticatedImageErrorEvent,
  AuthenticatedImageErrorOptions,
  AuthenticatedImageStatus,
  Fetcher,
  HeadersProvider,
} from './index';
export { AuthenticatedImageError, clearCache, configure } from './index';
