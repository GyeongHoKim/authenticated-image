import { ReactiveElement } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCache, configure, type Fetcher } from './config';
import type { AuthenticatedImageError } from './errors';
import { ImageLoaderController } from './image-loader-controller';
import { deferred, sleep, svgBlob } from './test-helpers';

class LoaderHost extends ReactiveElement {}
customElements.define('image-loader-host', LoaderHost);

function setup(fetcher?: Fetcher) {
  const host = document.createElement('image-loader-host') as LoaderHost;
  const onLoad = vi.fn();
  const onError = vi.fn<(error: AuthenticatedImageError) => void>();
  const loader = new ImageLoaderController(host, {
    overrides: () => ({ fetcher }),
    onLoad,
    onError,
  });
  document.body.append(host);
  return { host, loader, onLoad, onError };
}

afterEach(() => {
  document.body.replaceChildren();
  configure({});
  vi.restoreAllMocks();
});

describe('ImageLoaderController', () => {
  it('stays idle without a src', async () => {
    const fetcher = vi.fn<Fetcher>(async () => svgBlob());
    const { host, loader } = setup(fetcher);
    await host.updateComplete;
    expect(loader.status).toBe('idle');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('exposes the url while loading and becomes loaded on the image load event', async () => {
    const { host, loader, onLoad } = setup(async () => svgBlob());
    loader.load('a');
    await host.updateComplete;
    expect(loader.status).toBe('loading');
    expect(loader.busy).toBe(true);
    await expect.poll(() => loader.url).toMatch(/^blob:/);

    loader.handleImageLoad();
    expect(loader.status).toBe('loaded');
    expect(loader.busy).toBe(false);
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('drops a stale result when a new load starts', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const results = [first, second];
    const { host, loader } = setup(() => results.shift()?.promise ?? Promise.reject());
    loader.load('a');
    await host.updateComplete;
    loader.load('b');
    await host.updateComplete;
    second.resolve('data:b');
    await expect.poll(() => loader.url).toBe('data:b');
    first.resolve('data:a');
    await sleep(20);
    expect(loader.url).toBe('data:b');
  });

  it('aborts the request on disconnect without reporting an error', async () => {
    let signal: AbortSignal | undefined;
    const { host, loader, onError } = setup((_src, context) => {
      signal = context.signal;
      return new Promise((_resolve, reject) => {
        context.signal.addEventListener('abort', () => reject(context.signal.reason));
      });
    });
    loader.load('a');
    await host.updateComplete;
    host.remove();
    expect(signal?.aborted).toBe(true);
    await sleep(20);
    expect(onError).not.toHaveBeenCalled();
    expect(loader.status).toBe('idle');
  });

  it('revokes its object URL on disconnect', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const { host, loader } = setup(async () => svgBlob());
    loader.load('a');
    await expect.poll(() => loader.url).toMatch(/^blob:/);
    const url = loader.url;
    host.remove();
    expect(revoke).toHaveBeenCalledWith(url);
  });

  it('reports a failed request through onError', async () => {
    const { host, loader, onError } = setup(async () => {
      throw new Error('offline');
    });
    loader.load('a');
    await host.updateComplete;
    await expect.poll(() => loader.status).toBe('error');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(loader.error?.src).toBe('a');
  });

  it('fails without retrying when a blob cannot be decoded', async () => {
    const fetcher = vi.fn<Fetcher>(async () => svgBlob());
    const { loader, onError } = setup(fetcher);
    loader.load('a');
    await expect.poll(() => loader.url).toBeDefined();
    loader.handleImageError();
    expect(loader.status).toBe('error');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('asks once more when a string result fails to load', async () => {
    const fetcher = vi.fn<Fetcher>(async () => 'data:expired');
    const { loader, onError } = setup(fetcher);
    loader.load('a');
    await expect.poll(() => loader.url).toBe('data:expired');
    loader.handleImageError();
    await expect.poll(() => fetcher.mock.calls.length).toBe(2);
    await expect.poll(() => loader.url).toBe('data:expired');
    expect(onError).not.toHaveBeenCalled();

    loader.handleImageError();
    expect(loader.status).toBe('error');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('is busy while waiting for the viewport', async () => {
    const fetcher = vi.fn<Fetcher>(async () => svgBlob());
    const spacer = document.createElement('div');
    spacer.style.height = '3000px';
    document.body.prepend(spacer);
    const { host, loader } = setup(fetcher);
    loader.load('a', { lazy: true });
    await host.updateComplete;
    expect(loader.status).toBe('idle');
    expect(loader.busy).toBe(true);
    await sleep(100);
    expect(fetcher).not.toHaveBeenCalled();

    host.scrollIntoView();
    await expect.poll(() => fetcher.mock.calls.length).toBe(1);
  });

  it('reload() skips the shared cached copy', async () => {
    const fetcher = vi.fn<Fetcher>(async () => svgBlob());
    configure({ fetcher });
    clearCache();
    const { loader } = setup();
    loader.load('a');
    await expect.poll(() => loader.url).toBeDefined();
    loader.reload();
    await expect.poll(() => fetcher.mock.calls.length).toBe(2);
  });
});
