/* ── Dashboard Hooks ──────────────────────────────────────── */

"use client";

import { useQuery } from "@tanstack/react-query";
import { complianceApi } from "@/services/api/compliance";
import { adminApi } from "@/services/api/admin";
import type {
  ComplianceStatusResponse,
  PlatformMetricsResponse,
} from "@/types/api";

/** Query keys for dashboard domain. */
export const dashboardKeys = {
  all: ["dashboard"] as const,
  compliance: (companyId: number) =>
    [...dashboardKeys.all, "compliance", companyId] as const,
  metrics: () => [...dashboardKeys.all, "metrics"] as const,
};

/**
 * Compliance status for a company (dashboard summary).
 *
 * staleTime=30_000 + refetchOnWindowFocus=true: compliance is a slow-changing
 * aggregate; a 30-second staleness window is acceptable and avoids hammering
 * the backend on every navigation back to the dashboard (per F11).
 */
export function useDashboardCompliance(companyId: number | undefined | null) {
  return useQuery<ComplianceStatusResponse, Error>({
    queryKey: dashboardKeys.compliance(companyId ?? 0),
    queryFn: () => complianceApi.status(companyId as number),
    enabled: !!companyId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Platform-wide metrics (dashboard summary).
 *
 * staleTime=30_000 + refetchOnWindowFocus=true: platform metrics aggregate
 * across the company; 30s staleness is acceptable for the summary view (F11).
 */
export function useDashboardMetrics() {
  return useQuery<PlatformMetricsResponse, Error>({
    queryKey: dashboardKeys.metrics(),
    queryFn: () => adminApi.metrics(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
