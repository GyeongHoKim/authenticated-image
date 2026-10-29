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
