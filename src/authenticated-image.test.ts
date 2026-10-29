import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOCK_API_PREFIX, mockAuthHeaders } from '../dev/mock-api-shared';
import {
  AuthenticatedImageError,
  type AuthenticatedImageErrorEvent,
  clearCache,
  configure,
  type Fetcher,
} from './index';
import {
  deferred,
  innerImg,
  mount,
  nextEvent,
  sleep,
  slotNamed,
  svgBlob,
  svgDataUrl,
} from './test-helpers';

const images = `${MOCK_API_PREFIX}/images`;

afterEach(() => {
  document.body.replaceChildren();
  configure({});
  vi.restoreAllMocks();
});

describe('<authenticated-image>', () => {
  it('loads an image with the configured headers', async () => {
    configure({ headers: mockAuthHeaders });
    const element = mount({ src: `${images}/cat`, alt: 'Cat' });
    await nextEvent(element, 'load');
    await element.updateComplete;
    const img = innerImg(element);
    expect(element.status).toBe('loaded');
    expect(element.getAttribute('status')).toBe('loaded');
    expect(img.getAttribute('src')?.startsWith('blob:')).toBe(true);
    expect(img.alt).toBe('Cat');
    expect(img.hidden).toBe(false);
  });

  it('reports HTTP failures through the error event', async () => {
    const element = mount({ src: `${images}/cat` });
    const event = await nextEvent<AuthenticatedImageErrorEvent>(element, 'error');
    await element.updateComplete;
    expect(event.detail.error).toBeInstanceOf(AuthenticatedImageError);
    expect(event.detail.error.status).toBe(401);
    expect(element.error).toBe(event.detail.error);
    expect(element.status).toBe('error');
    expect(element.getAttribute('status')).toBe('error');
  });

  it('switches slots and aria-busy with the status', async () => {
    configure({ headers: mockAuthHeaders });
    const element = mount({ src: `${images}/slow?delay=300` });
    await element.updateComplete;
    expect(slotNamed(element, 'loading').hidden).toBe(false);
    expect(slotNamed(element, 'error').hidden).toBe(true);
    expect(innerImg(element).hidden).toBe(true);
    expect(element.getAttribute('aria-busy')).toBe('true');

    await nextEvent(element, 'load');
    await element.updateComplete;
    expect(slotNamed(element, 'loading').hidden).toBe(true);
    expect(element.hasAttribute('aria-busy')).toBe(false);

    element.src = `${images}/missing?status=404`;
    await nextEvent(element, 'error');
    await element.updateComplete;
    expect(slotNamed(element, 'error').hidden).toBe(false);
    expect(innerImg(element).hidden).toBe(true);
  });

  it('does not request anything for an empty src', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const element = mount({});
    await element.updateComplete;
    await sleep(50);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(element.status).toBe('idle');
  });

  it('ignores a stale response after src changes', async () => {
    const responses = { a: deferred<string>(), b: deferred<string>() };
    const signals: Record<string, AbortSignal> = {};
    const fetcher: Fetcher = (src, { signal }) => {
      signals[src] = signal;
      return responses[src as 'a' | 'b'].promise;
    };
    const element = mount({ fetcher, src: 'a' });
    await element.updateComplete;
    element.src = 'b';
    await element.updateComplete;
    expect(signals.a?.aborted).toBe(true);

    const loaded = nextEvent(element, 'load');
    responses.b.resolve(svgDataUrl('b'));
    await loaded;
    responses.a.resolve(svgDataUrl('a'));
    await sleep(50);
    await element.updateComplete;
    expect(innerImg(element).getAttribute('src')).toBe(svgDataUrl('b'));
  });

  it('does not fire error when a request is aborted', async () => {
    const fetcher: Fetcher = (_src, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      });
    const element = mount({ fetcher, src: 'a' });
    await element.updateComplete;
    const onError = vi.fn();
    element.addEventListener('error', onError);
    element.src = '';
    await element.updateComplete;
    await sleep(50);
    expect(onError).not.toHaveBeenCalled();
    expect(element.status).toBe('idle');
  });

  it('shares one request between elements with the same src', async () => {
    const fetcher = vi.fn<Fetcher>(async () => svgBlob());
    configure({ fetcher });
    const elements = [mount({ src: 'same' }), mount({ src: 'same' }), mount({ src: 'same' })];
    await Promise.all(elements.map((element) => nextEvent(element, 'load')));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const sources = elements.map((element) => innerImg(element).getAttribute('src'));
    expect(new Set(sources).size).toBe(1);
  });

  it('bypasses the cache for element-level fetchers', async () => {
    const globalFetcher = vi.fn<Fetcher>(async () => svgBlob());
    const elementFetcher = vi.fn<Fetcher>(async () => svgBlob());
    configure({ fetcher: globalFetcher });
    const elements = [
      mount({ src: 'same', fetcher: elementFetcher }),
      mount({ src: 'same', fetcher: elementFetcher }),
    ];
    await Promise.all(elements.map((element) => nextEvent(element, 'load')));
    expect(elementFetcher).toHaveBeenCalledTimes(2);
    expect(globalFetcher).not.toHaveBeenCalled();
  });

  it('revokes the object URL when removed', async () => {
    configure({ headers: mockAuthHeaders, cache: { retainMs: 0 } });
    const element = mount({ src: `${images}/cat` });
    await nextEvent(element, 'load');
    const url = innerImg(element).getAttribute('src');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    element.remove();
    expect(revoke).toHaveBeenCalledWith(url);
  });

  it('fails without retrying when a blob cannot be decoded', async () => {
    configure({ headers: mockAuthHeaders });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const element = mount({ src: `${images}/cat?body=broken` });
    const event = await nextEvent<AuthenticatedImageErrorEvent>(element, 'error');
    expect(event.detail.error.status).toBeUndefined();
    expect(event.detail.error.src).toBe(`${images}/cat?body=broken`);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('forwards width, height and decoding to the inner image', async () => {
    const element = mount({ width: 64, height: 32, decoding: 'sync' });
    await element.updateComplete;
    const img = innerImg(element);
    expect(img.getAttribute('width')).toBe('64');
    expect(img.getAttribute('height')).toBe('32');
    expect(img.getAttribute('decoding')).toBe('sync');
  });

  it('exposes the inner image as the img part', async () => {
    const element = mount({});
    await element.updateComplete;
    expect(innerImg(element).getAttribute('part')).toBe('img');
  });
});

describe('<authenticated-image> layout', () => {
  it('reserves the width and height of a lazy image before it loads', async () => {
    const fetcher = vi.fn<Fetcher>(async () => svgDataUrl('lazy'));
    const spacer = document.createElement('div');
    spacer.style.height = '3000px';
    document.body.append(spacer);
    const element = mount({
      src: 'lazy',
      alt: 'Lazy',
      loading: 'lazy',
      width: 120,
      height: 80,
      fetcher,
    });
    await element.updateComplete;
    const { width, height } = element.getBoundingClientRect();
    expect(width).toBe(120);
    expect(height).toBe(80);
    await sleep(100);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('renders slot content over the reserved box', async () => {
    const fetcher: Fetcher = () => new Promise(() => {});
    const element = mount({ src: 'pending', alt: 'Pending', width: 120, height: 80, fetcher });
    const placeholder = document.createElement('span');
    placeholder.slot = 'loading';
    placeholder.textContent = 'Loading';
    element.append(placeholder);
    await element.updateComplete;
    const host = element.getBoundingClientRect();
    const slotted = placeholder.getBoundingClientRect();
    expect(host.width).toBe(120);
    expect(host.height).toBe(80);
    expect(slotted.width).toBeGreaterThan(0);
    expect(slotted.top).toBe(host.top);
    expect(slotted.left).toBe(host.left);
  });

  it('hides the image without a broken icon in the error state', async () => {
    const fetcher: Fetcher = async () => {
      throw new Error('offline');
    };
    const element = mount({ src: 'broken', alt: 'Broken', width: 120, height: 80, fetcher });
    await nextEvent(element, 'error');
    await element.updateComplete;
    const img = innerImg(element);
    expect(img.hasAttribute('src')).toBe(false);
    expect(getComputedStyle(img).visibility).toBe('hidden');
    expect(element.getBoundingClientRect().height).toBe(80);
  });

  it('takes no space for alt text while an unsized image is not loaded', async () => {
    const fetcher: Fetcher = async () => {
      throw new Error('offline');
    };
    const pending = mount({
      src: 'pending',
      alt: 'A long alternative text',
      fetcher: () => new Promise(() => {}),
    });
    const failed = mount({ src: 'failed', alt: 'A long alternative text', fetcher });
    await nextEvent(failed, 'error');
    await Promise.all([pending.updateComplete, failed.updateComplete]);
    for (const element of [pending, failed]) {
      const { width, height } = element.getBoundingClientRect();
      expect(width).toBe(0);
      expect(height).toBe(0);
    }
  });

  it('sizes itself to the natural size of the image', async () => {
    const element = mount({ src: 'natural', fetcher: async () => svgDataUrl('natural') });
    await nextEvent(element, 'load');
    const { width, height } = element.getBoundingClientRect();
    expect(width).toBe(10);
    expect(height).toBe(10);
  });

  it('shrinks a wide image to fit its container', async () => {
    const container = document.createElement('div');
    container.style.width = '100px';
    document.body.append(container);
    const wide = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"/>')}`;
    const element = mount({ src: 'wide', fetcher: async () => wide }, container);
    await nextEvent(element, 'load');
    const { width, height } = innerImg(element).getBoundingClientRect();
    expect(width).toBe(100);
    expect(height).toBe(25);
  });

  it('lets ::part(img) fill a sized host', async () => {
    const style = document.createElement('style');
    style.textContent = `
      authenticated-image { width: 64px; height: 48px; }
      authenticated-image::part(img) { width: 100%; height: 100%; }
    `;
    document.body.append(style);
    const element = mount({ src: 'fill', fetcher: async () => svgDataUrl('fill') });
    await nextEvent(element, 'load');
    const { width, height } = innerImg(element).getBoundingClientRect();
    expect(width).toBe(64);
    expect(height).toBe(48);
  });
});

describe('<authenticated-image loading="lazy">', () => {
  it('waits for the viewport before requesting', async () => {
    const fetcher = vi.fn<Fetcher>(async () => svgDataUrl('lazy'));
    const spacer = document.createElement('div');
    spacer.style.height = '3000px';
    document.body.append(spacer);
    const element = mount({ src: 'lazy', loading: 'lazy', fetcher });
    await element.updateComplete;
    await sleep(100);
    expect(fetcher).not.toHaveBeenCalled();
    expect(element.status).toBe('idle');
    expect(element.getAttribute('aria-busy')).toBe('true');
    expect(slotNamed(element, 'loading').hidden).toBe(false);

    const loaded = nextEvent(element, 'load');
    element.scrollIntoView();
    await loaded;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('presigned URL retry', () => {
  it('asks the fetcher again once when a string result fails to load', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(`${MOCK_API_PREFIX}/signed/fox?expires=0&sig=00`)
      .mockImplementationOnce(async () => {
        const response = await fetch(`${MOCK_API_PREFIX}/presign/fox`, {
          headers: mockAuthHeaders,
        });
        return ((await response.json()) as { url: string }).url;
      });
    configure({ fetcher });
    const element = mount({ src: 'fox' });
    await nextEvent(element, 'load');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(element.status).toBe('loaded');
  });

  it('fails when the retry also fails', async () => {
    const fetcher = vi.fn<Fetcher>(async () => `${MOCK_API_PREFIX}/signed/fox?expires=0&sig=00`);
    configure({ fetcher });
    const element = mount({ src: 'fox' });
    await nextEvent(element, 'error');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(element.status).toBe('error');
  });

  it('retries element-level fetchers too', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(`${MOCK_API_PREFIX}/signed/fox?expires=0&sig=00`)
      .mockResolvedValueOnce(svgDataUrl('fresh'));
    const element = mount({ src: 'fox', fetcher });
    await nextEvent(element, 'load');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('reload()', () => {
  it('fetches again, bypassing the cached copy', async () => {
    const fetcher = vi.fn<Fetcher>(async () => svgBlob());
    configure({ fetcher });
    const element = mount({ src: 'a' });
    await nextEvent(element, 'load');
    const reloaded = nextEvent(element, 'load');
    element.reload();
    await reloaded;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not evict a newer cache entry that another element uses', async () => {
    const fetcher = vi.fn<Fetcher>(async () => svgBlob());
    configure({ fetcher });
    const stale = mount({ src: 'a' });
    await nextEvent(stale, 'load');
    clearCache();
    const fresh = mount({ src: 'a' });
    await nextEvent(fresh, 'load');
    const freshUrl = innerImg(fresh).getAttribute('src');

    const reloaded = nextEvent(stale, 'load');
    stale.reload();
    await reloaded;
    const late = mount({ src: 'a' });
    await nextEvent(late, 'load');
    expect(innerImg(late).getAttribute('src')).toBe(freshUrl);
  });

  it('recovers from an error', async () => {
    const element = mount({ src: `${images}/cat` });
    await nextEvent(element, 'error');
    configure({ headers: mockAuthHeaders });
    const loaded = nextEvent(element, 'load');
    element.reload();
    await loaded;
    expect(element.status).toBe('loaded');
    expect(element.error).toBeUndefined();
  });
});

describe('element-level fetcher and headers', () => {
  it('does not refetch when given a new but equivalent headers object', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const element = mount({ src: `${images}/cat`, headers: { ...mockAuthHeaders } });
    await nextEvent(element, 'load');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    element.headers = { ...mockAuthHeaders };
    await element.updateComplete;
    await sleep(50);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(element.status).toBe('loaded');
  });

  it('does not refetch when given a new fetcher, and uses it on the next load', async () => {
    const first = vi.fn<Fetcher>(async () => svgBlob());
    const second = vi.fn<Fetcher>(async () => svgBlob());
    const element = mount({ src: 'a', fetcher: first });
    await nextEvent(element, 'load');
    element.fetcher = second;
    await element.updateComplete;
    await sleep(50);
    expect(second).not.toHaveBeenCalled();

    const reloaded = nextEvent(element, 'load');
    element.reload();
    await reloaded;
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('configure() and on-screen images', () => {
  it('keeps visible images and uses the new configuration for new elements', async () => {
    const first = vi.fn<Fetcher>(async () => svgBlob());
    const second = vi.fn<Fetcher>(async () => svgBlob());
    configure({ fetcher: first });
    const visible = mount({ src: 'a' });
    await nextEvent(visible, 'load');
    const url = innerImg(visible).getAttribute('src');

    configure({ fetcher: second });
    await sleep(50);
    expect(second).not.toHaveBeenCalled();
    expect(innerImg(visible).getAttribute('src')).toBe(url);

    const fresh = mount({ src: 'a' });
    await nextEvent(fresh, 'load');
    expect(second).toHaveBeenCalledTimes(1);
  });
});
