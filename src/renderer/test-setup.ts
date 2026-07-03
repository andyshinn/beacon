import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Ensure @testing-library/react cleans up between tests when vitest globals
// are not enabled (auto-cleanup requires the global afterEach to be present).
afterEach(() => {
  cleanup();
});

// happy-dom exposes navigator.clipboard as a non-configurable getter, which
// prevents Object.assign from overriding it in tests. Redefine it as a
// configurable, writable property so test code can swap in a mock.
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  writable: true,
  value: { writeText: () => Promise.resolve() },
});

// Node v26 exposes `localStorage` as undefined unless --localstorage-file is
// provided. happy-dom's populateGlobal skips keys already present on global,
// so `localStorage` is never injected into the test scope. We install a simple
// in-memory Storage shim so persist-middleware tests can call localStorage.clear().
if (typeof localStorage === "undefined" || localStorage === null) {
  const store: Record<string, string> = {};
  const shim: Storage = {
    get length() {
      return Object.keys(store).length;
    },
    key(index: number): string | null {
      return Object.keys(store)[index] ?? null;
    },
    getItem(key: string): string | null {
      return Object.hasOwn(store, key) ? (store[key] ?? null) : null;
    },
    setItem(key: string, value: string): void {
      store[key] = String(value);
    },
    removeItem(key: string): void {
      delete store[key];
    },
    clear(): void {
      for (const key of Object.keys(store)) delete store[key];
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    enumerable: true,
    value: shim,
    writable: true,
  });
}
