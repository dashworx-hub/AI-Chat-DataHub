/**
 * Vitest test setup — runs before every test file.
 * Provides browser-API mocks that jsdom doesn't include.
 */
import { vi } from 'vitest';
import '@testing-library/jest-dom';

// localStorage mock (Settings.jsx uses it)
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i) => Object.keys(store)[i] ?? null),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// matchMedia mock (Tailwind responsive classes)
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query) => ({
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

// ResizeObserver mock (Vega charts use it)
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// fetch mock placeholder — individual tests override as needed
global.fetch = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
);
