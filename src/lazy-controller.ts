import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { observeLazy, unobserveLazy } from './lazy';

/**
 * Runs a callback once the host comes near the viewport, and cancels it when the host
 * disconnects.
 */
export class LazyController implements ReactiveController {
  readonly #host: ReactiveControllerHost & Element;
  #waiting = false;

  constructor(host: ReactiveControllerHost & Element) {
    this.#host = host;
    host.addController(this);
  }

  /** Whether a callback is waiting for the host to come near the viewport. */
  get waiting(): boolean {
    return this.#waiting;
  }

  /** Calls `callback` once the host comes near the viewport. Replaces a pending callback. */
  whenVisible(callback: () => void): void {
    this.#waiting = true;
    observeLazy(this.#host, () => {
      this.#waiting = false;
      this.#host.requestUpdate();
      callback();
    });
    this.#host.requestUpdate();
  }

  /** Cancels a pending callback. */
  cancel(): void {
    if (!this.#waiting) return;
    this.#waiting = false;
    unobserveLazy(this.#host);
    this.#host.requestUpdate();
  }

  hostDisconnected(): void {
    this.cancel();
  }
}
