import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { installMatchMediaMock, resetMediaState } from './media.js';

afterEach(() => {
  cleanup();
  resetMediaState();
  vi.useRealTimers();
});

// --- jsdom polyfills -------------------------------------------------------------------------

installMatchMediaMock();

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverStub,
    writable: true,
  });
}

// Radix Select / Slider / vaul use pointer capture + scrollIntoView, which jsdom lacks.
const proto = Element.prototype as Element & {
  hasPointerCapture?: (id: number) => boolean;
  setPointerCapture?: (id: number) => void;
  releasePointerCapture?: (id: number) => void;
  scrollIntoView?: () => void;
};
if (typeof proto.hasPointerCapture !== 'function') proto.hasPointerCapture = () => false;
if (typeof proto.setPointerCapture !== 'function') proto.setPointerCapture = () => {};
if (typeof proto.releasePointerCapture !== 'function') proto.releasePointerCapture = () => {};
if (typeof proto.scrollIntoView !== 'function') proto.scrollIntoView = () => {};

// vaul reads window.visualViewport; jsdom has none.
if (typeof window !== 'undefined' && !('visualViewport' in window)) {
  Object.defineProperty(window, 'visualViewport', {
    value: null,
    writable: true,
    configurable: true,
  });
}
