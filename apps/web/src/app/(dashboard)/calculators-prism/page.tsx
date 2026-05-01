"use client";

/**
 * Calculator Hub (Prism) — Side-by-side pilot of Prism Form engine.
 *
 * Shows the same calculator grid as the bespoke /calculators route, but
 * links to /calculators-prism/[type] where each detail page renders a
 * Prism <Form> instead of hand-rolled AppInput fields. This page is the
 * entry point for the M-01 migration wave.
 *
 * Layout uses Prism's VStack + Grid (Layout engine) instead of bespoke
 * Tailwind grid, demonstrating Layout-engine composition. The cards
 * themselves still use arbor's AppCard/AppButton for visual parity —
 * Prism's Card atom is not wired into arbor's design tokens yet, so a
 * Prism-native card would drift visually from the bespoke baseline.
 *
 * Compare with /calculators for the bespoke implementation.
 */

import { useRouter } from "next/navigation";
import { LayoutProvider, VStack, Grid } from "@kailash/prism-web";
import { AppCard, AppButton } from "@/components/design-system";
import { Calculator } from "lucide-react";
import { CALCULATORS } from "../calculators/elements/calculator-config";

export default function CalculatorsPrismPage() {
  const router = useRouter();

  return (
    <LayoutProvider>
      <div className="max-w-4xl mx-auto pb-8">
        <VStack gap={24}>
          {/* Header — mirrors bespoke /calculators header for visual parity */}
          <div className="flex items-center gap-3">
            <Calculator
              className="h-7 w-7 text-[var(--color-primary)]"
              aria-hidden="true"
            />
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-gray-900)]">
                HR Calculators (Prism)
              </h1>
              <p className="text-sm text-[var(--color-gray-500)] mt-0.5">
                Deterministic calculations based on current Singapore
                employment regulations. All calculations are auditable — no
                AI, just the law. Powered by Prism Form engine.
              </p>
            </div>
          </div>

          {/* Calculator grid — Prism Grid, responsive 1→2 columns */}
          <Grid columns={{ mobile: 1, tablet: 2, desktop: 2, wide: 2 }} gap={16}>
            {CALCULATORS.map((calc) => {
              const Icon = calc.icon;
              return (
                <AppCard
                  key={calc.slug}
                  variant="standard"
                  className="flex flex-col"
                >
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-[var(--color-primary-bg)]">
                        <Icon
                          className="h-5 w-5 text-[var(--color-primary)]"
                          aria-hidden="true"
                        />
                      </div>
                      <h2 className="text-sm font-semibold text-[var(--color-gray-900)]">
                        {calc.name}
                      </h2>
                    </div>
                    <p className="text-sm text-[var(--color-gray-600)] leading-relaxed">
                      {calc.description}
                    </p>
                  </div>
                  <div className="pt-4">
                    <AppButton
                      variant="outlined"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        router.push(`/calculators-prism/${calc.slug}`)
                      }
                    >
                      Open Calculator
                    </AppButton>
                  </div>
                </AppCard>
              );
            })}
          </Grid>
        </VStack>
      </div>
    </LayoutProvider>
  );
}
