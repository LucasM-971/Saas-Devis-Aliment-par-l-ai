import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Bloque tout fetch réseau pendant les tests
vi.stubGlobal('fetch', () =>
  Promise.reject(new Error('réseau désactivé dans les tests unitaires')),
);

// jsdom n'implémente pas IntersectionObserver (utilisé par la landing) : stub minimal.
if (!('IntersectionObserver' in globalThis)) {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  globalThis.IntersectionObserver = IO as unknown as typeof IntersectionObserver;
}
