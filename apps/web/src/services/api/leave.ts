/* ── Leave API Service ────────────────────────────────────── */

import { apiClient } from "./client";

/* ── Types ────────────────────────────────────────────────── */

/**
 * Leave type configuration as returned by `GET /leave/types`.
 *
 * Canonical backend shape (LeaveTypeConfig DataFlow model — see
 * `src/hr_advisory/models/company_user.py:889`): `name`, `code`, `category`,
 * `default_days`, plus `is_paid`, `is_pro_ratable`, `requires_attachment`,
 * `is_active`. The frontend used to read display values from a response
 * shape that differed from the model (`leave_type_name`, `entitlement_days`)
 * — those legacy aliases are kept as optional fields so existing JSX that
 * defensively reads either alias type-checks without an `as any` cast.
 *
 * The leave/page.tsx admin "Leave Type Configuration" table reads
 * `lt.name || lt.leave_type_name` and `lt.default_days ?? lt.entitlement_days`
 * — both halves of each pair are optional here so neither side breaks.
 */
export interface LeaveType {
  id: number;
  name: string;
  description?: string;
  is_paid: boolean;
  requires_attachment: boolean;
  is_active: boolean;
  /** Canonical backend fields. */
  code?: string;
  category?: string;
  is_pro_ratable?: boolean;
  default_days?: number;
  max_carry_forward?: number;
  carry_forward_expiry_months?: number;
  min_service_months?: number;
  applicable_gender?: string;
  /** Legacy aliases — kept optional for response-shape variations. */
  leave_type_name?: string;
  entitlement_days?: number;
  max_days_per_year?: number;
  gender_restriction?: string;
}

export interface LeaveApplication {
  id: number;
  employee_id: number;
  employee_name: string;
  leave_type_id: number;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  half_day_start: boolean;
  half_day_end: boolean;
  total_days: number;
  reason: string;
  status:
    | "draft"
    | "pending"
    | "approved"
    | "rejected"
    | "withdrawn"
    | "cancelled";
  attachment_url: string | null;
  approver_id: number | null;
  approver_name: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveBalance {
  leave_type_id: number;
  leave_type_name: string;
  entitlement: number;
  used: number;
  pending: number;
  remaining: number;
}

export interface PublicHoliday {
  id: number;
  name: string;
  date: string;
  is_recurring: boolean;
}

export interface LeaveCalendarEntry {
  date: string;
  employee_id: number;
  employee_name: string;
  leave_type_name: string;
  status: string;
  is_half_day: boolean;
}

export interface ApplyLeaveData {
  leave_type_id: number;
  start_date: string;
  end_date: string;
  half_day_start?: boolean;
  half_day_end?: boolean;
  reason: string;
}

/* ── API Methods ─────────────────────────────────────────── */

export const leaveApi = {
  /**
   * List all leave types configured for the company.
   *
   * The backend currently returns `{ leave_types: LeaveTypeConfig[], count }`
   * (src/hr_advisory/api/routers/leave.py:463) but earlier response shapes
   * used `{ types: LeaveType[] }`. The return type carries both keys as
   * optional so the page-level fallback `typesRes.types ?? typesRes.leave_types`
   * type-checks without an `as any` cast.
   */
  listTypes(): Promise<{
    types?: LeaveType[];
    leave_types?: LeaveType[];
    count?: number;
  }> {
    return apiClient.get<{
      types?: LeaveType[];
      leave_types?: LeaveType[];
      count?: number;
    }>("/leave/types");
  },

  /** Apply for leave. */
  applyLeave(data: ApplyLeaveData): Promise<LeaveApplication> {
    return apiClient.post<LeaveApplication>("/leave/applications", data);
  },

  /** Upload an attachment (e.g. medical certificate) for a leave application. */
  uploadAttachment(
    applicationId: number,
    formData: FormData,
  ): Promise<{ url: string }> {
    return apiClient.postFormData<{ url: string }>(
      `/leave/applications/${applicationId}/attachment`,
      formData,
    );
  },

  /** List leave applications with optional filters. */
  listApplications(params?: {
    status?: string;
    employee_id?: string;
  }): Promise<{ applications: LeaveApplication[]; count: number }> {
    return apiClient.get<{ applications: LeaveApplication[]; count: number }>(
      "/leave/applications",
      params,
    );
  },

  /** Approve a leave application. */
  approve(applicationId: number): Promise<LeaveApplication> {
    return apiClient.post<LeaveApplication>(
      `/leave/applications/${applicationId}/approve`,
    );
  },

  /** Reject a leave application. */
  reject(applicationId: number, reason: string): Promise<LeaveApplication> {
    return apiClient.post<LeaveApplication>(
      `/leave/applications/${applicationId}/reject`,
      { reason },
    );
  },

  /** Withdraw a pending leave application (by the employee). */
  withdraw(applicationId: number): Promise<LeaveApplication> {
    return apiClient.post<LeaveApplication>(
      `/leave/applications/${applicationId}/withdraw`,
    );
  },

  /** Cancel an approved leave application (by admin). */
  cancel(applicationId: number): Promise<LeaveApplication> {
    return apiClient.post<LeaveApplication>(
      `/leave/applications/${applicationId}/cancel`,
    );
  },

  /** Get leave balances for the current employee. */
  getBalances(): Promise<{ balances: LeaveBalance[] }> {
    return apiClient.get<{ balances: LeaveBalance[] }>("/leave/balances");
  },

  /** Get leave balances for a specific employee (admin). */
  getEmployeeBalances(
    employeeId: number,
  ): Promise<{ balances: LeaveBalance[] }> {
    return apiClient.get<{ balances: LeaveBalance[] }>(
      `/leave/balances/${employeeId}`,
    );
  },

  /** List public holidays. */
  listHolidays(): Promise<{ holidays: PublicHoliday[] }> {
    return apiClient.get<{ holidays: PublicHoliday[] }>("/leave/holidays");
  },

  /** Get leave calendar for a date range. */
  getCalendar(params: {
    start_date: string;
    end_date: string;
  }): Promise<{ entries: LeaveCalendarEntry[] }> {
    return apiClient.get<{ entries: LeaveCalendarEntry[] }>(
      "/leave/calendar",
      params,
    );
  },

  /** List leave policies (admin). */
  listPolicies(): Promise<{
    policies: Record<string, unknown>[];
    count: number;
  }> {
    return apiClient.get<{
      policies: Record<string, unknown>[];
      count: number;
    }>("/leave/policies");
  },
};
