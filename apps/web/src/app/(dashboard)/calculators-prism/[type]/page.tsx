"use client";

/**
 * Calculator Detail Page (Prism) — Dispatches by slug and renders a
 * Prism <Form> driven by prism-calculator-configs.
 *
 * Single page handles all 7 calculator types via config lookup. The
 * form itself is fully declarative (FieldDef[]). Result state is owned
 * here because Prism's Form has no built-in result display — see the
 * M-01 findings doc for the gap that motivates a potential FormAdapter
 * interface.
 *
 * Compare with /calculators/[type] for the bespoke dispatcher.
 */

import { use, useCallback, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  Form,
  LayoutProvider,
  VStack,
  type FormConfig,
} from "@kailash/prism-web";
import { getCalculatorBySlug } from "../../calculators/elements/calculator-config";
import {
  getCalculatorConfig,
  type CalculatorResult,
} from "@/lib/prism-calculator-configs";
import { ARBOR_FORM_CLASS_NAMES } from "@/lib/prism-form-classnames";
import { sanitizeErrorMessage } from "@/lib/prism-error-sanitize";

interface CalculatorDetailPrismPageProps {
  params: Promise<{ type: string }>;
}

interface SubmittedState {
  values: Record<string, unknown>;
  result: CalculatorResult;
}

export default function CalculatorDetailPrismPage({
  params,
}: CalculatorDetailPrismPageProps) {
  const { type } = use(params);
  const meta = getCalculatorBySlug(type);
  const config = getCalculatorConfig(type);

  // Result state lives in the page, not the Form. On each successful
  // submit the Form's onSubmit resolves, and we store {values, result}
  // so the renderResult callback has both.
  const [submitted, setSubmitted] = useState<SubmittedState | null>(null);

  // onSubmit MUST be stable (Form re-renders on every state change);
  // useCallback prevents Form from tearing down on every keystroke.
  const handleSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (!config) return;
      // compute() can throw (e.g. backend 500, validation). Prism Form
      // catches thrown errors and surfaces them via its error banner.
      // Red-team S2 mitigation: we re-throw a sanitised Error so backend
      // error bodies never reach the UI submitError banner verbatim.
      try {
        const result = await config.compute(values);
        setSubmitted({ values, result });
      } catch (err) {
        setSubmitted(null);
        throw new Error(sanitizeErrorMessage(err));
      }
    },
    [config],
  );

  if (!meta || !config) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-8">
        <Link
          href="/calculators-prism"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Calculators
        </Link>
        <div className="text-center py-12">
          <p className="text-lg font-semibold text-[var(--color-gray-900)]">
            Calculator not found
          </p>
          <p className="text-sm text-[var(--color-gray-500)] mt-1">
            The calculator type &ldquo;{type}&rdquo; does not exist.
          </p>
        </div>
      </div>
    );
  }

  const Icon = meta.icon;

  // Assemble the FormConfig. Only include optional fields when defined
  // because the Prism types use `... | undefined` (not exact optional) but
  // arbor may turn on exactOptionalPropertyTypes in future — being strict
  // here avoids churn.
  const formConfig: FormConfig = {
    fields: config.fields,
    onSubmit: handleSubmit,
    submitLabel: config.submitLabel,
    layout: "two-column",
    "aria-label": `${config.title} form`,
    // Red-team H1 mitigation (M-01 BLOCKING-5 consumer):
    // Apply arbor-branded classNames so fields / labels / buttons match
    // the rest of arbor visually. Without this, Prism's default inline
    // styles render off-brand greys.
    classNames: ARBOR_FORM_CLASS_NAMES,
    ...(config.sections ? { sections: config.sections } : {}),
  };

  return (
    <LayoutProvider>
      <div className="max-w-4xl mx-auto pb-8">
        <VStack gap={24}>
          {/* Back link */}
          <div>
            <Link
              href="/calculators-prism"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--color-primary)] hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Calculators
            </Link>
          </div>

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--color-primary-bg)]">
              <Icon
                className="h-6 w-6 text-[var(--color-primary)]"
                aria-hidden="true"
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-gray-900)]">
                {config.title}
              </h1>
              <p className="text-sm text-[var(--color-gray-500)] mt-0.5">
                {config.description}
              </p>
            </div>
          </div>

          {/* Form — Prism Form engine, no bespoke <input> */}
          <div className="rounded-lg border border-[var(--color-gray-200)] bg-white p-6">
            <Form {...formConfig} />
          </div>

          {/* Result — owned by the page, rendered via config.renderResult */}
          {submitted &&
            config.renderResult(submitted.values, submitted.result)}
        </VStack>
      </div>
    </LayoutProvider>
  );
}
