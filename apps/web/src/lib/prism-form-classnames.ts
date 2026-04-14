/**
 * Arbor-branded className overrides for the Prism Form engine (FormConfig.classNames).
 *
 * Purpose
 * -------
 * Prism 0.2.0 added `FormConfig.classNames` so consumers can replace the
 * engine's default inline-style look with their own branded classes. Arbor
 * ships `AppInput` / `AppButton` atoms (src/components/design-system/) that
 * consume arbor's `--color-*` CSS variables for theme cohesion.
 *
 * The Prism Form renders `<input>`, `<select>`, `<textarea>`, `<label>`, and
 * the submit/reset buttons itself — we can't swap the elements for arbor
 * atoms without rebuilding the whole engine. The `classNames` override is the
 * sanctioned escape hatch: we hand Prism the same Tailwind classes that
 * `AppInput` / `AppButton` emit, so the Prism-rendered fields match arbor's
 * `AppInput` / `AppButton` visually pixel-for-pixel.
 *
 * Why this file exists
 * --------------------
 * M-01 BLOCKING-5 in `workspaces/fe-codegen-platform/04-validate/migration-m01-findings.md`:
 * without `classNames`, Prism's calculator forms render in Prism's default
 * greys (`#d1d5db` border, `#2563eb` submit) that visually drift from every
 * other form on arbor. This overrides that.
 *
 * Keep in sync with
 * -----------------
 * - `src/components/design-system/AppInput.tsx` — source for input / label / error styles.
 * - `src/components/design-system/AppButton.tsx` — source for submit / reset styles.
 *
 * When either atom changes, mirror the change here. Tests verify the strings
 * match by structural parity (visual parity is verified by running
 * `/calculators-prism/cpf` side by side with `/calculators/cpf`).
 */

import type { FormConfig } from "@kailash/prism-web";

/**
 * Base input classes mirrored from `AppInput.tsx` (the `baseFieldClasses`
 * constant). Excluding layout bits that Prism's field wrapper supplies.
 */
const ARBOR_INPUT_CLASS = [
  "w-full rounded-[8px] border px-3 py-2 text-base min-h-[44px]",
  "bg-[var(--color-surface-input)] text-[var(--foreground)]",
  "border-[var(--color-surface-input-border)]",
  "placeholder:text-[var(--color-gray-400)]",
  "transition-colors",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
  "focus:border-[var(--color-surface-input-focus)]",
  "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");

/**
 * Label class mirrored from `AppInput.tsx`:
 *   `text-sm font-medium text-[var(--color-gray-700)]`
 */
const ARBOR_LABEL_CLASS = "text-sm font-medium text-[var(--color-gray-700)]";

/**
 * Error class mirrored from `AppInput.tsx`'s error `<p>`:
 *   `text-sm text-[var(--color-error)]`
 */
const ARBOR_ERROR_CLASS = "text-sm text-[var(--color-error)]";

/**
 * Help-text class mirrored from `AppInput.tsx`'s helper `<p>`:
 *   `text-sm text-[var(--color-gray-500)]`
 */
const ARBOR_HELP_CLASS = "text-sm text-[var(--color-gray-500)]";

/**
 * Field-group class. `AppInput` wraps each field in
 * `flex flex-col gap-1.5` — mirror the same gap so Prism's label/input/error
 * stack matches arbor's.
 */
const ARBOR_FIELD_CLASS = "flex flex-col gap-1.5";

/**
 * Actions-row class. Prism's default uses inline flex; arbor bespoke forms
 * right-align primary actions with `justify-end gap-2`.
 */
const ARBOR_ACTIONS_CLASS = "flex items-center justify-end gap-2 pt-2";

/**
 * Submit button class mirrored from `AppButton.tsx` primary variant + md size.
 * Variant: primary (`bg-[var(--color-primary)] text-white ...`).
 * Size: md (`px-4 py-2 text-base min-h-[44px]`).
 */
const ARBOR_SUBMIT_CLASS = [
  "inline-flex items-center justify-center gap-2 rounded-[8px] font-medium transition-colors",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  // primary variant
  "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-light)] active:bg-[var(--color-primary-dark)]",
  // md size
  "px-4 py-2 text-base min-h-[44px]",
].join(" ");

/**
 * Reset button class mirrored from `AppButton.tsx` outlined variant + md size.
 */
const ARBOR_RESET_CLASS = [
  "inline-flex items-center justify-center gap-2 rounded-[8px] font-medium transition-colors",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  // outlined variant
  "border-2 border-[var(--color-primary)] text-[var(--color-primary)] bg-transparent hover:bg-[var(--color-primary)] hover:text-white",
  // md size
  "px-4 py-2 text-base min-h-[44px]",
].join(" ");

/**
 * Arbor-branded `FormConfig.classNames` override.
 *
 * Pass this on every arbor Prism `<Form>` mount so the form fields match
 * arbor's `AppInput` / `AppButton` visual language instead of Prism's default.
 *
 * Usage:
 * ```ts
 * const formConfig: FormConfig = {
 *   fields: ...,
 *   onSubmit: ...,
 *   classNames: ARBOR_FORM_CLASS_NAMES,
 * };
 * ```
 */
export const ARBOR_FORM_CLASS_NAMES: NonNullable<FormConfig["classNames"]> = {
  field: ARBOR_FIELD_CLASS,
  label: ARBOR_LABEL_CLASS,
  input: ARBOR_INPUT_CLASS,
  error: ARBOR_ERROR_CLASS,
  helpText: ARBOR_HELP_CLASS,
  actions: ARBOR_ACTIONS_CLASS,
  submitButton: ARBOR_SUBMIT_CLASS,
  resetButton: ARBOR_RESET_CLASS,
};
