import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// next/image depende da configuração do Next; nos testes basta um <img> simples.
vi.mock('next/image', () => ({
  default: ({ src, alt, width, height, className }: Record<string, unknown>) =>
    createElement('img', {
      src: typeof src === 'string' ? src : (src as { src?: string } | undefined)?.src,
      alt,
      width,
      height,
      className,
    }),
}));

afterEach(() => {
  cleanup();
  if (typeof window !== 'undefined') {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('style');
  }
});

// jsdom não implementa matchMedia; next-themes usa para o tema "Sistema".
// Guardado por typeof window porque themeCompliance.test.ts roda em ambiente
// "node" (@vitest-environment node) e este setup também é executado nele.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Radix usa ResizeObserver e scrollIntoView.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
}
