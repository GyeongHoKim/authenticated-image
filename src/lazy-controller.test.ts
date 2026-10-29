import { ReactiveElement } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LazyController } from './lazy-controller';
import { sleep } from './test-helpers';

class LazyHost extends ReactiveElement {}
customElements.define('lazy-controller-host', LazyHost);

function mountBelowTheFold(): { host: LazyHost; lazy: LazyController } {
  const spacer = document.createElement('div');
  spacer.style.height = '3000px';
  const host = document.createElement('lazy-controller-host') as LazyHost;
  host.style.display = 'block';
  host.style.height = '10px';
  const lazy = new LazyController(host);
  document.body.append(spacer, host);
  return { host, lazy };
}

afterEach(() => {
  document.body.replaceChildren();
  window.scrollTo(0, 0);
});

describe('LazyController', () => {
  it('waits until the host comes near the viewport', async () => {
    const { host, lazy } = mountBelowTheFold();
    const callback = vi.fn();
    lazy.whenVisible(callback);
    expect(lazy.waiting).toBe(true);
    await sleep(100);
    expect(callback).not.toHaveBeenCalled();

    host.scrollIntoView();
    await expect.poll(() => callback.mock.calls.length).toBe(1);
    expect(lazy.waiting).toBe(false);
  });

  it('cancels a pending callback', async () => {
    const { host, lazy } = mountBelowTheFold();
    const callback = vi.fn();
    lazy.whenVisible(callback);
    lazy.cancel();
    expect(lazy.waiting).toBe(false);
    host.scrollIntoView();
    await sleep(200);
    expect(callback).not.toHaveBeenCalled();
  });

  it('cancels when the host disconnects', async () => {
    const { host, lazy } = mountBelowTheFold();
    const callback = vi.fn();
    lazy.whenVisible(callback);
    host.remove();
    expect(lazy.waiting).toBe(false);
    document.body.append(host);
    host.scrollIntoView();
    await sleep(200);
    expect(callback).not.toHaveBeenCalled();
  });
});
