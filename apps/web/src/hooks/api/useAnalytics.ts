/* ── Analytics Hooks ──────────────────────────────────────── */

"use client";

import { useQuery } from "@tanstack/react-query";
import { complianceApi } from "@/services/api/compliance";
import { adminApi } from "@/services/api/admin";
import { profileApi } from "@/services/api/profile";
import type {
  ComplianceStatusResponse,
  PlatformMetricsResponse,
  QueryPatternsResponse,
  FeedbackSummaryResponse,
  MonthlyReportResponse,
  WorkforceBreakdown,
} from "@/types/api";

/** Query keys for analytics domain. */
export const analyticsKeys = {
  all: ["analytics"] as const,
  workforce: (companyId: number) =>
    [...analyticsKeys.all, "workforce", companyId] as const,
  compliance: (companyId: number) =>
    [...analyticsKeys.all, "compliance", companyId] as const,
  metrics: () => [...analyticsKeys.all, "metrics"] as const,
  queryPatterns: () => [...analyticsKeys.all, "queryPatterns"] as const,
  feedbackSummary: () => [...analyticsKeys.all, "feedbackSummary"] as const,
  monthlyReport: () => [...analyticsKeys.all, "monthlyReport"] as const,
};

/**
 * Per-hook staleTime decisions (F11):
 *
 * Analytics queries use 5 * 60_000 (5 minutes) + refetchOnWindowFocus=false
 * because the data is computed server-side, expensive, and aggregated over
 * historical windows that don't change minute-to-minute. Refresh-on-focus
 * would be costly with no user-visible benefit. (per workspace spec
 * frontend-data-fetching.md, F11.)
 */
const ANALYTICS_STALE_MS = 5 * 60_000;

export function useAnalyticsWorkforce(companyId: number | undefined | null) {
  return useQuery<WorkforceBreakdown, Error>({
    queryKey: analyticsKeys.workforce(companyId ?? 0),
    queryFn: () => profileApi.workforce(companyId as number),
    enabled: !!companyId,
    staleTime: ANALYTICS_STALE_MS,
    refetchOnWindowFocus: false,
  });
}

export function useAnalyticsCompliance(companyId: number | undefined | null) {
  return useQuery<ComplianceStatusResponse, Error>({
    queryKey: analyticsKeys.compliance(companyId ?? 0),
    queryFn: () => complianceApi.status(companyId as number),
    enabled: !!companyId,
    staleTime: ANALYTICS_STALE_MS,
    refetchOnWindowFocus: false,
  });
}

export function useAnalyticsMetrics() {
  return useQuery<PlatformMetricsResponse, Error>({
    queryKey: analyticsKeys.metrics(),
    queryFn: () => adminApi.metrics(),
    staleTime: ANALYTICS_STALE_MS,
    refetchOnWindowFocus: false,
  });
}

export function useAnalyticsQueryPatterns() {
  return useQuery<QueryPatternsResponse, Error>({
    queryKey: analyticsKeys.queryPatterns(),
    queryFn: () => adminApi.queryPatterns(),
    staleTime: ANALYTICS_STALE_MS,
    refetchOnWindowFocus: false,
  });
}

export function useAnalyticsFeedbackSummary() {
  return useQuery<FeedbackSummaryResponse, Error>({
    queryKey: analyticsKeys.feedbackSummary(),
    queryFn: () => adminApi.feedbackSummary(),
    staleTime: ANALYTICS_STALE_MS,
    refetchOnWindowFocus: false,
  });
}

/**
 * Monthly learning-pipeline report.
 *
 * Backend may return an `{ empty: true }` sentinel when no reports exist yet
 * (the service signature is permissive on the runtime shape). Callers MUST
 * narrow on the `period` field before consuming report fields.
 */
export function useAnalyticsMonthlyReport() {
  return useQuery<MonthlyReportResponse, Error>({
    queryKey: analyticsKeys.monthlyReport(),
    queryFn: () => adminApi.monthlyReport(),
    staleTime: ANALYTICS_STALE_MS,
    refetchOnWindowFocus: false,
  });
}
