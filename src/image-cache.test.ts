import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageCache, toImageUrl } from './image-cache';
import { deferred, svgBlob } from './test-helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toImageUrl', () => {
  it('uses strings as-is', () => {
    expect(toImageUrl('https://example.com/a.png')).toEqual({
      url: 'https://example.com/a.png',
      isObjectUrl: false,
    });
  });

  it('creates object URLs for blobs', () => {
    const image = toImageUrl(svgBlob());
    expect(image.isObjectUrl).toBe(true);
    expect(image.url.startsWith('blob:')).toBe(true);
  });

  it('rejects other values', () => {
    expect(() => toImageUrl(42)).toThrow(TypeError);
  });
});

describe('ImageCache', () => {
  it('shares one request between leases of the same key', async () => {
    const cache = new ImageCache(1000);
    const loader = vi.fn(async () => svgBlob());
    const first = cache.acquire('a', loader);
    const second = cache.acquire('a', loader);
    const [firstImage, secondImage] = await Promise.all([first.image, second.image]);
    expect(firstImage.url).toBe(secondImage.url);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(1);
  });

  it('aborts a pending request when the last lease is released', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const cache = new ImageCache(1000);
    const response = deferred<Blob>();
    let signal: AbortSignal | undefined;
    const loader = vi.fn((loaderSignal: AbortSignal) => {
      signal = loaderSignal;
      return response.promise;
    });
    const lease = cache.acquire('a', loader);
    lease.release();
    expect(cache.size).toBe(0);
    await vi.waitFor(() => expect(loader).toHaveBeenCalled());
    expect(signal?.aborted).toBe(true);
    response.resolve(svgBlob());
    await expect(lease.image).rejects.toMatchObject({ name: 'AbortError' });
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('keeps the request alive while another lease is active', async () => {
    const cache = new ImageCache(1000);
    let signal: AbortSignal | undefined;
    const loader = vi.fn(async (loaderSignal: AbortSignal) => {
      signal = loaderSignal;
      return svgBlob();
    });
    const first = cache.acquire('a', loader);
    const second = cache.acquire('a', loader);
    first.release();
    await second.image;
    expect(signal?.aborted).toBe(false);
  });

  it('treats release as idempotent', async () => {
    const cache = new ImageCache(1000);
    let signal: AbortSignal | undefined;
    const loader = vi.fn(async (loaderSignal: AbortSignal) => {
      signal = loaderSignal;
      return svgBlob();
    });
    const first = cache.acquire('a', loader);
    const second = cache.acquire('a', loader);
    first.release();
    first.release();
    await second.image;
    expect(signal?.aborted).toBe(false);
    expect(cache.size).toBe(1);
  });

  it('drops failed entries so the next acquire retries', async () => {
    const cache = new ImageCache(1000);
    const loader = vi
      .fn<(signal: AbortSignal) => Promise<Blob>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(svgBlob());
    const failed = cache.acquire('a', loader);
    await expect(failed.image).rejects.toThrow('network');
    expect(cache.size).toBe(0);
    const retried = cache.acquire('a', loader);
    await expect(retried.image).resolves.toMatchObject({ isObjectUrl: true });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('rejects loaders that resolve to something other than a Blob or string', async () => {
    const cache = new ImageCache(1000);
    const lease = cache.acquire('a', async () => 42);
    await expect(lease.image).rejects.toThrow(TypeError);
    expect(cache.size).toBe(0);
  });

  it('keeps in-use images alive after detachAll and revokes them on the last release', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const cache = new ImageCache(1000);
    const lease = cache.acquire('a', async () => svgBlob());
    const { url } = await lease.image;
    cache.detachAll();
    expect(cache.size).toBe(0);
    expect(revoke).not.toHaveBeenCalled();
    const freshLoader = vi.fn(async () => svgBlob());
    const fresh = cache.acquire('a', freshLoader);
    await fresh.image;
    expect(freshLoader).toHaveBeenCalledTimes(1);
    lease.release();
    expect(revoke).toHaveBeenCalledWith(url);
  });

  it('detaching a lease only affects its own key', async () => {
    const cache = new ImageCache(1000);
    const a = cache.acquire('a', async () => svgBlob());
    const b = cache.acquire('b', async () => svgBlob());
    await Promise.all([a.image, b.image]);
    a.detach();
    expect(cache.size).toBe(1);
  });

  it('detaches only the entry a lease holds', async () => {
    const cache = new ImageCache(1000);
    const first = cache.acquire('a', async () => svgBlob());
    await first.image;
    cache.detachAll();
    const loader = vi.fn(async () => svgBlob());
    const second = cache.acquire('a', loader);
    await second.image;
    first.detach();
    expect(cache.size).toBe(1);
    cache.acquire('a', loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('stops sharing the entry when its lease detaches it', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const cache = new ImageCache(1000);
    const lease = cache.acquire('a', async () => svgBlob());
    const { url } = await lease.image;
    lease.detach();
    expect(cache.size).toBe(0);
    expect(revoke).not.toHaveBeenCalled();
    lease.release();
    expect(revoke).toHaveBeenCalledWith(url);
  });

  describe('retention', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('revokes after retainMs once the last lease is released', async () => {
      const revoke = vi.spyOn(URL, 'revokeObjectURL');
      const cache = new ImageCache(1000);
      const lease = cache.acquire('a', async () => svgBlob());
      const { url } = await lease.image;
      lease.release();
      vi.advanceTimersByTime(999);
      expect(revoke).not.toHaveBeenCalled();
      expect(cache.size).toBe(1);
      vi.advanceTimersByTime(1);
      expect(revoke).toHaveBeenCalledWith(url);
      expect(cache.size).toBe(0);
    });

    it('reuses the entry when it is acquired again during retention', async () => {
      const revoke = vi.spyOn(URL, 'revokeObjectURL');
      const cache = new ImageCache(1000);
      const loader = vi.fn(async () => svgBlob());
      const first = cache.acquire('a', loader);
      const { url } = await first.image;
      first.release();
      vi.advanceTimersByTime(500);
      const second = cache.acquire('a', loader);
      expect((await second.image).url).toBe(url);
      vi.advanceTimersByTime(1000);
      expect(revoke).not.toHaveBeenCalled();
      second.release();
      vi.advanceTimersByTime(1000);
      expect(revoke).toHaveBeenCalledWith(url);
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('revokes immediately when retainMs is 0', async () => {
      const revoke = vi.spyOn(URL, 'revokeObjectURL');
      const cache = new ImageCache(0);
      const lease = cache.acquire('a', async () => svgBlob());
      const { url } = await lease.image;
      lease.release();
      expect(revoke).toHaveBeenCalledWith(url);
      expect(cache.size).toBe(0);
    });

    it('disposes retained entries immediately on detachAll', async () => {
      const revoke = vi.spyOn(URL, 'revokeObjectURL');
      const cache = new ImageCache(1000);
      const lease = cache.acquire('a', async () => svgBlob());
      const { url } = await lease.image;
      lease.release();
      cache.detachAll();
      expect(revoke).toHaveBeenCalledWith(url);
      expect(cache.size).toBe(0);
    });

    it.each([Number.POSITIVE_INFINITY, 2 ** 31])(
      'never expires entries when retainMs is %s',
      async (retainMs) => {
        const revoke = vi.spyOn(URL, 'revokeObjectURL');
        const cache = new ImageCache(retainMs);
        const lease = cache.acquire('a', async () => svgBlob());
        await lease.image;
        lease.release();
        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(2 ** 31);
        expect(revoke).not.toHaveBeenCalled();
        expect(cache.size).toBe(1);
      },
    );

    it.each([Number.NaN, -1])('treats a retainMs of %s as 0', async (retainMs) => {
      const revoke = vi.spyOn(URL, 'revokeObjectURL');
      const cache = new ImageCache(1000);
      cache.setRetainMs(retainMs);
      const lease = cache.acquire('a', async () => svgBlob());
      const { url } = await lease.image;
      lease.release();
      expect(revoke).toHaveBeenCalledWith(url);
      expect(cache.size).toBe(0);
    });

    it('applies a new retainMs from setRetainMs', async () => {
      const revoke = vi.spyOn(URL, 'revokeObjectURL');
      const cache = new ImageCache(1000);
      cache.setRetainMs(10);
      const lease = cache.acquire('a', async () => svgBlob());
      await lease.image;
      lease.release();
      vi.advanceTimersByTime(10);
      expect(revoke).toHaveBeenCalledTimes(1);
    });
  });
});
