import { createElement, createRef, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOCK_API_PREFIX, mockAuthHeaders } from '../dev/mock-api-shared';
import { AuthenticatedImageElement, type AuthenticatedImageErrorEvent } from './index';
import { AuthenticatedImage, configure, type Fetcher } from './react';
import { svgBlob } from './test-helpers';

let root: Root | undefined;

function render(element: ReactElement): void {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  root.render(element);
}

afterEach(() => {
  root?.unmount();
  root = undefined;
  document.body.replaceChildren();
  configure({});
});

describe('<AuthenticatedImage>', () => {
  it('renders the custom element and forwards onLoad', async () => {
    configure({ headers: mockAuthHeaders });
    const onLoad = vi.fn();
    render(
      createElement(AuthenticatedImage, {
        src: `${MOCK_API_PREFIX}/images/react`,
        alt: 'React',
        onLoad,
      }),
    );
    await expect.poll(() => onLoad.mock.calls.length).toBe(1);
    expect(document.querySelector('authenticated-image')?.alt).toBe('React');
  });

  it('forwards onError with the error detail', async () => {
    const onError = vi.fn<(event: AuthenticatedImageErrorEvent) => void>();
    render(createElement(AuthenticatedImage, { src: `${MOCK_API_PREFIX}/images/react`, onError }));
    await expect.poll(() => onError.mock.calls.length).toBe(1);
    expect(onError.mock.calls[0]?.[0].detail.error.status).toBe(401);
  });

  it('passes fetcher as a property and exposes the element through ref', async () => {
    const fetcher = vi.fn<Fetcher>(async () => svgBlob());
    const ref = createRef<AuthenticatedImageElement>();
    const onLoad = vi.fn();
    render(createElement(AuthenticatedImage, { src: 'any', fetcher, ref, onLoad }));
    await expect.poll(() => onLoad.mock.calls.length).toBe(1);
    expect(ref.current).toBeInstanceOf(AuthenticatedImageElement);
    ref.current?.reload();
    await expect.poll(() => onLoad.mock.calls.length).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('renders slotted fallback content', async () => {
    render(
      createElement(
        AuthenticatedImage,
        { src: `${MOCK_API_PREFIX}/images/react?delay=500`, headers: mockAuthHeaders },
        createElement('span', { slot: 'loading', id: 'spinner' }, 'Loading'),
      ),
    );
    await expect.poll(() => document.getElementById('spinner')?.assignedSlot?.name).toBe('loading');
  });
});
