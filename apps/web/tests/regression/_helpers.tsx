/* ── Regression test helpers ──────────────────────────────────
   Tier-2 test infrastructure for the Shard-D S2 TanStack Query
   migrations. The 6 page-level regression specs in this directory
   each pin a migration's behavior against canned fixture data
   (loading / data / error / empty), satisfying brief criterion 4
   ("no regression in production behavior") per F9 + F18.
   ──────────────────────────────────────────────────────────── */

import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";

/**
 * Build a QueryClient configured for tests:
 *   - retry: false   — surface errors immediately (no exponential backoff)
 *   - gcTime: 0      — clear caches between tests (mirror production where
 *                       a fresh visit always hydrates)
 *   - staleTime: 0   — same; the per-hook staleTime decisions are exercised
 *                       at the production hook level, the test client just
 *                       observes the result.
 */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface ProviderProps {
  client?: QueryClient;
  children: ReactNode;
}

export function TestProviders({ client, children }: ProviderProps) {
  const qc = client ?? makeTestQueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/**
 * Render with a QueryClientProvider wrapper. Use a fresh QueryClient per
 * test to avoid cross-test cache leakage.
 */
export function renderWithQueryClient(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper"> & { client?: QueryClient },
) {
  const { client, ...renderOptions } = options ?? {};
  const qc = client ?? makeTestQueryClient();
  return {
    queryClient: qc,
    ...render(ui, {
      wrapper: ({ children }) => (
        <TestProviders client={qc}>{children}</TestProviders>
      ),
      ...renderOptions,
    }),
  };
}

/**
 * A Promise that never resolves — useful for asserting the loading state
 * stays visible.
 */
export function neverResolves<T = unknown>(): Promise<T> {
  return new Promise<T>(() => {
    /* intentionally never resolves */
  });
}
