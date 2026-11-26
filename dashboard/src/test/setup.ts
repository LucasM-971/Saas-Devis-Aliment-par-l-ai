import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Les tests ne parlent jamais au backend : tout fetch échoue immédiatement,
// les composants branchés sur l'API affichent leur état d'erreur ou se masquent.
// Sans ce stub, jsdom tente de vraies connexions qui se résolvent après le
// démontage du test (« error caught after teardown »).
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
