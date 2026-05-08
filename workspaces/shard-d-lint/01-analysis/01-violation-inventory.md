# Shard D — Full Lint Violation Inventory

Generated: 2026-05-08 from `cd apps/web && npx eslint . --format json`. Total: 31 errors, 52 warnings.

## By rule (count)

| Count | Severity | Rule |
|-|-|-|
| 48 | warning | `@typescript-eslint/no-unused-vars` |
| 16 | error | `react-hooks/set-state-in-effect` |
| 10 | error | `@typescript-eslint/no-explicit-any` |
| 3 | warning | `react-hooks/exhaustive-deps` |
| 2 | error | `react/no-unescaped-entities` |
| 1 | error | `react-hooks/immutability` |
| 1 | error | `react-hooks/purity` |
| 1 | error | `@next/next/no-assign-module-variable` |
| 1 | warning | `jsx-a11y/role-has-required-aria-props` |

## Detailed listing (errors first, then warnings)

### Errors

- `src/components/shadow-agent/ArborResult.tsx:50:3` — **@next/next/no-assign-module-variable** — Do not assign to the variable `module`. See: https://nextjs.org/docs/messages/no-assign-module-variable
- `src/app/(auth)/onboarding/page.tsx:44:14` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/app/(auth)/onboarding/page.tsx:46:21` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/app/(dashboard)/appraisals/page.tsx:672:55` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/app/(dashboard)/employees/page.tsx:926:21` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/app/(dashboard)/leave/page.tsx:867:52` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/app/(dashboard)/leave/page.tsx:1003:36` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/app/(dashboard)/projects/page.tsx:248:56` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/app/(dashboard)/recruitment/page.tsx:932:49` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/components/company/CompanySetupModal.tsx:60:12` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/components/company/CompanySetupModal.tsx:69:19` — **@typescript-eslint/no-explicit-any** — Unexpected any. Specify a different type.
- `src/app/(dashboard)/analytics/page.tsx:122:5` — **react-hooks/immutability** — Error: Cannot reassign variable after render completes
- `src/app/(dashboard)/employees/[id]/page.tsx:302:58` — **react-hooks/purity** — Error: Cannot call impure function during render
- `src/app/(auth)/signup/page.tsx:534:7` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/app/(dashboard)/analytics/page.tsx:400:7` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/app/(dashboard)/dashboard/page.tsx:368:7` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/app/(dashboard)/documents/[id]/preview/page.tsx:20:7` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/app/(dashboard)/documents/page.tsx:72:5` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/app/(dashboard)/employees/[id]/page.tsx:516:5` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/app/(dashboard)/employees/[id]/page.tsx:1334:5` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/app/(dashboard)/employees/[id]/page.tsx:1885:5` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/components/advisory-panel/AdvisoryPanel.tsx:88:7` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/components/design-system/EmployeePicker.tsx:42:5` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/components/shadow-agent/PaceCard.tsx:76:5` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/components/shadow-agent/useObservation.ts:217:5` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/components/shadow-agent/useObservation.ts:230:5` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/components/shell/AppShell.tsx:23:7` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/contexts/AdvisoryPanelContext.tsx:68:9` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/contexts/AdvisoryPanelContext.tsx:85:7` — **react-hooks/set-state-in-effect** — Error: Calling setState synchronously within an effect can trigger cascading renders
- `src/components/company/CompanySetupModal.tsx:211:18` — **react/no-unescaped-entities** — `'` can be escaped with `&apos;`, `&lsquo;`, `&#39;`, `&rsquo;`.
- `src/components/company/CompanySetupModal.tsx:237:18` — **react/no-unescaped-entities** — `'` can be escaped with `&apos;`, `&lsquo;`, `&#39;`, `&rsquo;`.

### Warnings

- `src/app/(dashboard)/admin/elements/__tests__/NewSessionModal.test.tsx:4:26` — **@typescript-eslint/no-unused-vars** — 'within' is defined but never used.
- `src/app/(dashboard)/admin/elements/FeedbackReviewTab.tsx:4:10` — **@typescript-eslint/no-unused-vars** — 'AppButton' is defined but never used.
- `src/app/(dashboard)/admin/elements/OverviewTab.tsx:11:3` — **@typescript-eslint/no-unused-vars** — 'Loader2' is defined but never used.
- `src/app/(dashboard)/advisory/history/page.tsx:20:3` — **@typescript-eslint/no-unused-vars** — 'AppCard' is defined but never used.
- `src/app/(dashboard)/alerts/page.tsx:18:3` — **@typescript-eslint/no-unused-vars** — 'Loader2' is defined but never used.
- `src/app/(dashboard)/analytics/page.tsx:369:10` — **@typescript-eslint/no-unused-vars** — 'reportLoading' is assigned a value but never used.
- `src/app/(dashboard)/analytics/page.tsx:374:10` — **@typescript-eslint/no-unused-vars** — 'metricsError' is assigned a value but never used.
- `src/app/(dashboard)/analytics/page.tsx:376:10` — **@typescript-eslint/no-unused-vars** — 'feedbackError' is assigned a value but never used.
- `src/app/(dashboard)/analytics/page.tsx:377:10` — **@typescript-eslint/no-unused-vars** — 'reportError' is assigned a value but never used.
- `src/app/(dashboard)/approvals/page.tsx:44:10` — **@typescript-eslint/no-unused-vars** — 'StatusBadge' is defined but never used.
- `src/app/(dashboard)/dashboard/page.tsx:8:3` — **@typescript-eslint/no-unused-vars** — 'AlertBanner' is defined but never used.
- `src/app/(dashboard)/documents/[id]/preview/page.tsx:6:49` — **@typescript-eslint/no-unused-vars** — 'Download' is defined but never used.
- `src/app/(dashboard)/employees/[id]/page.tsx:1317:3` — **@typescript-eslint/no-unused-vars** — 'employeeId' is defined but never used.
- `src/app/(dashboard)/inventory/page.tsx:17:3` — **@typescript-eslint/no-unused-vars** — 'ArrowRight' is defined but never used.
- `src/app/(dashboard)/my-inventory/page.tsx:159:11` — **@typescript-eslint/no-unused-vars** — 'user' is assigned a value but never used.
- `src/app/(dashboard)/my-payslips/page.tsx:24:38` — **@typescript-eslint/no-unused-vars** — 'end' is defined but never used.
- `src/app/(dashboard)/my-profile/page.tsx:199:11` — **@typescript-eslint/no-unused-vars** — 'user' is assigned a value but never used.
- `src/app/(dashboard)/my-profile/page.tsx:207:9` — **@typescript-eslint/no-unused-vars** — 'payrollRequired' is assigned a value but never used.
- `src/app/(dashboard)/my-profile/page.tsx:218:14` — **@typescript-eslint/no-unused-vars** — 'err' is defined but never used.
- `src/app/(dashboard)/my-timesheets/page.tsx:239:11` — **@typescript-eslint/no-unused-vars** — 'user' is assigned a value but never used.
- `src/app/(dashboard)/payroll/[id]/page.tsx:46:38` — **@typescript-eslint/no-unused-vars** — 'end' is defined but never used.
- `src/app/(dashboard)/payroll/page.tsx:17:3` — **@typescript-eslint/no-unused-vars** — 'ArrowRight' is defined but never used.
- `src/app/(dashboard)/payroll/page.tsx:39:38` — **@typescript-eslint/no-unused-vars** — 'end' is defined but never used.
- `src/app/(dashboard)/recruitment/page.tsx:51:7` — **@typescript-eslint/no-unused-vars** — 'STAGE_STYLES' is assigned a value but never used.
- `src/app/(dashboard)/reports/page.tsx:352:9` — **@typescript-eslint/no-unused-vars** — 'isAdmin' is assigned a value but never used.
- `src/app/(dashboard)/settings/import/page.tsx:18:3` — **@typescript-eslint/no-unused-vars** — 'LoadingState' is defined but never used.
- `src/app/(dashboard)/settings/import/page.tsx:26:3` — **@typescript-eslint/no-unused-vars** — 'FieldMapping' is defined but never used.
- `src/app/(dashboard)/settings/integrations/page.tsx:9:3` — **@typescript-eslint/no-unused-vars** — 'Phone' is defined but never used.
- `src/app/(dashboard)/shifts/page.tsx:34:10` — **@typescript-eslint/no-unused-vars** — 'formatCurrency' is defined but never used.
- `src/app/(dashboard)/training/skillsfuture/page.tsx:3:20` — **@typescript-eslint/no-unused-vars** — 'useCallback' is defined but never used.
- `src/app/(dashboard)/training/skillsfuture/page.tsx:21:3` — **@typescript-eslint/no-unused-vars** — 'toast' is defined but never used.
- `src/app/(dashboard)/training/skillsfuture/page.tsx:48:7` — **@typescript-eslint/no-unused-vars** — 'FUNDING_OPTIONS' is assigned a value but never used.
- `src/components/advisory/EscalationDialog.tsx:25:7` — **@typescript-eslint/no-unused-vars** — 'URGENCY_TIMEFRAMES' is assigned a value but never used.
- `src/components/advisory/SystemMessage.tsx:134:3` — **@typescript-eslint/no-unused-vars** — 'messageId' is defined but never used.
- `src/components/dashboard/ExpiringDocumentsWidget.tsx:64:13` — **@typescript-eslint/no-unused-vars** — 'ninetyDaysMs' is assigned a value but never used.
- `src/components/management/ManagementShowcase.tsx:13:3` — **@typescript-eslint/no-unused-vars** — 'BarChart3' is defined but never used.
- `src/components/onboarding/FirstQuestionStep.tsx:6:10` — **@typescript-eslint/no-unused-vars** — 'AppCard' is defined but never used.
- `src/components/shadow-agent/ArborHistory.tsx:8:3` — **@typescript-eslint/no-unused-vars** — 'RotateCcw' is defined but never used.
- `src/components/shadow-agent/CommandSurface.tsx:558:31` — **@typescript-eslint/no-unused-vars** — 'sid' is defined but never used.
- `src/components/shadow-agent/ShadowMargin.tsx:62:3` — **@typescript-eslint/no-unused-vars** — 'onOpenHistory' is defined but never used.
- `src/components/shell/NavigationSidebar.tsx:496:3` — **@typescript-eslint/no-unused-vars** — 'collapsed' is defined but never used.
- `src/hooks/api/useProfile.ts:68:17` — **@typescript-eslint/no-unused-vars** — 'data' is defined but never used.
- `src/lib/prism-advisory-adapter.ts:85:19` — **@typescript-eslint/no-unused-vars** — '_data' is defined but never used.
- `tests/e2e/00-route-intercept-verify.spec.ts:4:16` — **@typescript-eslint/no-unused-vars** — 'expect' is defined but never used.
- `tests/e2e/04-advisory-chat.spec.ts:10:16` — **@typescript-eslint/no-unused-vars** — 'expect' is defined but never used.
- `tests/e2e/05-calculators.spec.ts:65:11` — **@typescript-eslint/no-unused-vars** — 'cpfButton' is assigned a value but never used.
- `tests/e2e/helpers/auth.helper.ts:96:11` — **@typescript-eslint/no-unused-vars** — 'request' is assigned a value but never used.
- `tests/e2e/helpers/auth.helper.ts:116:14` — **@typescript-eslint/no-unused-vars** — 'err' is defined but never used.
- `src/components/shell/TopBar.tsx:226:19` — **jsx-a11y/role-has-required-aria-props** — Elements with the ARIA role "combobox" must have the following attributes defined: aria-controls,aria-expanded
- `src/app/(dashboard)/advisory/history/page.tsx:230:9` — **react-hooks/exhaustive-deps** — The 'conversations' logical expression could make the dependencies of useMemo Hook (at line 260) change on every render. Move it inside the useMemo callback. Alternatively, wrap the initialization of 
- `src/app/(dashboard)/alerts/page.tsx:156:9` — **react-hooks/exhaustive-deps** — The 'alerts' logical expression could make the dependencies of useMemo Hook (at line 190) change on every render. To fix this, wrap the initialization of 'alerts' in its own useMemo() Hook.
- `src/app/(dashboard)/alerts/page.tsx:156:9` — **react-hooks/exhaustive-deps** — The 'alerts' logical expression could make the dependencies of useMemo Hook (at line 227) change on every render. To fix this, wrap the initialization of 'alerts' in its own useMemo() Hook.