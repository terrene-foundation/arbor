/* ── Employee Hooks ───────────────────────────────────────── */

"use client";

import { useQuery } from "@tanstack/react-query";
import { employeesApi, type Employee } from "@/services/api/employees";

/** Query keys for the employees domain. */
export const employeesKeys = {
  all: ["employees"] as const,
  list: () => [...employeesKeys.all, "list"] as const,
};

interface EmployeeListResponse {
  employees: Employee[];
  count: number;
}

/**
 * List employees for the EmployeePicker component.
 *
 * staleTime=60_000 + refetchOnWindowFocus=true: profile data rarely changes
 * within a session and the picker is mounted on multiple forms (claims,
 * leave, projects). 60s caches the list across sibling pickers without
 * staleness becoming a problem (per F11).
 */
export function useEmployeeForPicker() {
  return useQuery<EmployeeListResponse, Error>({
    queryKey: employeesKeys.list(),
    queryFn: () => employeesApi.list(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
