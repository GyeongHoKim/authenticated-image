/** How far outside the viewport a lazy image starts loading. */
export const LAZY_ROOT_MARGIN = '200px';

const callbacks = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | undefined;

function getObserver(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const onNear = callbacks.get(entry.target);
        if (!onNear) continue;
        unobserveLazy(entry.target);
        onNear();
      }
    },
    { rootMargin: LAZY_ROOT_MARGIN },
  );
  return observer;
}

/** Calls `onNear` once when `element` comes within {@link LAZY_ROOT_MARGIN} of the viewport. */
export function observeLazy(element: Element, onNear: () => void): void {
  callbacks.set(element, onNear);
  getObserver().observe(element);
}

/** Cancels a pending {@link observeLazy} callback. */
export function unobserveLazy(element: Element): void {
  callbacks.delete(element);
  observer?.unobserve(element);
}
