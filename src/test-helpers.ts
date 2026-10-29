import type { AuthenticatedImageElement } from './authenticated-image';

/** A promise with its resolve and reject functions exposed. */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A small, decodable SVG blob. */
export function svgBlob(): Blob {
  return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], {
    type: 'image/svg+xml',
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type MountProps = Partial<
  Pick<
    AuthenticatedImageElement,
    'src' | 'alt' | 'loading' | 'decoding' | 'width' | 'height' | 'fetcher' | 'headers'
  >
>;

/** Creates an `<authenticated-image>`, applies `props` and appends it to `container`. */
export function mount(
  props: MountProps,
  container: HTMLElement = document.body,
): AuthenticatedImageElement {
  const element = document.createElement('authenticated-image');
  Object.assign(element, props);
  container.append(element);
  return element;
}

export function nextEvent<T extends Event = Event>(target: EventTarget, type: string): Promise<T> {
  return new Promise((resolve) => {
    target.addEventListener(type, (event) => resolve(event as T), { once: true });
  });
}

export function innerImg(element: AuthenticatedImageElement): HTMLImageElement {
  const img = element.shadowRoot?.querySelector('img');
  if (!img) throw new Error('The inner <img> was not rendered.');
  return img;
}

export function slotNamed(element: AuthenticatedImageElement, name: string): HTMLSlotElement {
  const slot = element.shadowRoot?.querySelector<HTMLSlotElement>(`slot[name="${name}"]`);
  if (!slot) throw new Error(`The "${name}" slot was not rendered.`);
  return slot;
}

/** A decodable SVG data URL whose content identifies it by `label`. */
export function svgDataUrl(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>${label}</title></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
