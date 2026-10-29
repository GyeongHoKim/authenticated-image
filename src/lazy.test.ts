import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeLazy, unobserveLazy } from './lazy';
import { sleep } from './test-helpers';

function placeBelowTheFold(): HTMLElement {
  const spacer = document.createElement('div');
  spacer.style.height = '3000px';
  const target = document.createElement('div');
  target.style.height = '10px';
  document.body.append(spacer, target);
  return target;
}

afterEach(() => {
  document.body.replaceChildren();
  window.scrollTo(0, 0);
});

describe('observeLazy', () => {
  it('calls back once the element approaches the viewport', async () => {
    const target = placeBelowTheFold();
    const onNear = vi.fn();
    observeLazy(target, onNear);
    await sleep(100);
    expect(onNear).not.toHaveBeenCalled();
    target.scrollIntoView();
    await expect.poll(() => onNear.mock.calls.length).toBe(1);
  });

  it('calls back only once', async () => {
    const target = placeBelowTheFold();
    const onNear = vi.fn();
    observeLazy(target, onNear);
    target.scrollIntoView();
    await expect.poll(() => onNear.mock.calls.length).toBe(1);
    window.scrollTo(0, 0);
    await sleep(100);
    target.scrollIntoView();
    await sleep(100);
    expect(onNear).toHaveBeenCalledTimes(1);
  });

  it('calls back right away for elements already in view', async () => {
    const target = document.createElement('div');
    target.style.height = '10px';
    document.body.append(target);
    const onNear = vi.fn();
    observeLazy(target, onNear);
    await expect.poll(() => onNear.mock.calls.length).toBe(1);
  });
});

describe('unobserveLazy', () => {
  it('cancels a pending callback', async () => {
    const target = placeBelowTheFold();
    const onNear = vi.fn();
    observeLazy(target, onNear);
    unobserveLazy(target);
    target.scrollIntoView();
    await sleep(200);
    expect(onNear).not.toHaveBeenCalled();
  });
});
