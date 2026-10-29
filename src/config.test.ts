import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOCK_API_PREFIX, mockAuthHeaders } from '../dev/mock-api-shared';
import {
  clearCache,
  configure,
  DEFAULT_RETAIN_MS,
  defaultFetch,
  type Fetcher,
  imageCache,
  resolveLoader,
} from './config';
import { AuthenticatedImageError } from './errors';
import { svgBlob } from './test-helpers';

const image = `${MOCK_API_PREFIX}/images/cat`;
const signal = () => new AbortController().signal;

afterEach(() => {
  configure({});
  vi.restoreAllMocks();
});

describe('defaultFetch', () => {
  it('resolves to a blob when the request succeeds', async () => {
    const blob = await defaultFetch(image, mockAuthHeaders, signal());
    expect(blob.type).toBe('image/svg+xml');
  });

  it('accepts an async headers function', async () => {
    const blob = await defaultFetch(image, async () => mockAuthHeaders, signal());
    expect(blob).toBeInstanceOf(Blob);
  });

  it('throws AuthenticatedImageError with the status on HTTP errors', async () => {
    const promise = defaultFetch(image, undefined, signal());
    await expect(promise).rejects.toBeInstanceOf(AuthenticatedImageError);
    await expect(promise).rejects.toMatchObject({ status: 401, src: image });
  });

  it('forwards the abort signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(defaultFetch(image, mockAuthHeaders, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('resolveLoader', () => {
  it('prefers the element fetcher over everything else', async () => {
    const globalFetcher = vi.fn<Fetcher>(async () => svgBlob());
    const elementFetcher = vi.fn<Fetcher>(async () => 'element');
    configure({ fetcher: globalFetcher, headers: mockAuthHeaders });
    const loader = resolveLoader({ fetcher: elementFetcher, headers: mockAuthHeaders });
    const abortSignal = signal();
    await expect(loader.load('/a', abortSignal)).resolves.toBe('element');
    expect(elementFetcher).toHaveBeenCalledWith('/a', { signal: abortSignal });
    expect(globalFetcher).not.toHaveBeenCalled();
    expect(loader.cacheable).toBe(false);
  });

  it('uses element headers over the global fetcher', async () => {
    const globalFetcher = vi.fn<Fetcher>(async () => svgBlob());
    configure({ fetcher: globalFetcher });
    const loader = resolveLoader({ headers: mockAuthHeaders });
    await expect(loader.load(image, signal())).resolves.toBeInstanceOf(Blob);
    expect(globalFetcher).not.toHaveBeenCalled();
    expect(loader.cacheable).toBe(false);
  });

  it('uses the global fetcher over global headers', async () => {
    const globalFetcher = vi.fn<Fetcher>(async () => 'global');
    configure({ fetcher: globalFetcher, headers: mockAuthHeaders });
    const loader = resolveLoader({});
    await expect(loader.load('/a', signal())).resolves.toBe('global');
    expect(loader.cacheable).toBe(true);
  });

  it('uses global headers with the default fetch', async () => {
    configure({ headers: mockAuthHeaders });
    const loader = resolveLoader({});
    await expect(loader.load(image, signal())).resolves.toBeInstanceOf(Blob);
    expect(loader.cacheable).toBe(true);
  });

  it('falls back to a plain fetch without headers', async () => {
    const loader = resolveLoader({});
    await expect(loader.load(image, signal())).rejects.toMatchObject({ status: 401 });
    expect(loader.cacheable).toBe(true);
  });
});

describe('configure', () => {
  it('replaces the previous configuration instead of merging it', async () => {
    const globalFetcher = vi.fn<Fetcher>(async () => 'global');
    configure({ fetcher: globalFetcher });
    configure({ headers: mockAuthHeaders });
    await expect(resolveLoader({}).load(image, signal())).resolves.toBeInstanceOf(Blob);
    expect(globalFetcher).not.toHaveBeenCalled();
  });

  it('detaches the cache and applies retainMs', () => {
    const detachAll = vi.spyOn(imageCache, 'detachAll');
    const setRetainMs = vi.spyOn(imageCache, 'setRetainMs');
    configure({ cache: { retainMs: 5 } });
    expect(detachAll).toHaveBeenCalledTimes(1);
    expect(setRetainMs).toHaveBeenLastCalledWith(5);
    configure({});
    expect(setRetainMs).toHaveBeenLastCalledWith(DEFAULT_RETAIN_MS);
  });
});

describe('clearCache', () => {
  it('detaches every cache entry', () => {
    const detachAll = vi.spyOn(imageCache, 'detachAll');
    clearCache();
    expect(detachAll).toHaveBeenCalledTimes(1);
  });
});
