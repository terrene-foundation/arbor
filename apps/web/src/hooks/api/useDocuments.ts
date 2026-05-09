/* ── Document Hooks ───────────────────────────────────────── */

"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { documentsApi } from "@/services/api/documents";
import type {
  DocumentTemplate,
  DocumentTemplateListResponse,
  DocumentGenerateRequest,
  DocumentGenerateResponse,
} from "@/types/api";

/** Query keys for document domain. */
export const documentKeys = {
  all: ["documents"] as const,
  templates: () => [...documentKeys.all, "templates"] as const,
  template: (templateId: string) =>
    [...documentKeys.all, "template", templateId] as const,
};

/**
 * Fetch all document templates.
 *
 * staleTime=0 (always refetch on mount) + refetchOnWindowFocus=true: external
 * admins can delete templates between visits, so the list MUST reflect server
 * truth on every navigation (per workspace spec frontend-data-fetching.md, F11).
 */
export function useDocumentTemplates() {
  return useQuery<DocumentTemplateListResponse, Error>({
    queryKey: documentKeys.templates(),
    queryFn: () => documentsApi.listTemplates(),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetch a single document template by ID.
 * Only fetches when templateId is provided.
 *
 * staleTime=0 + refetchOnWindowFocus=true: a template could be deleted between
 * the list view and the preview navigation (per F11 redteam analysis).
 */
export function useDocumentTemplate(templateId: string) {
  return useQuery<DocumentTemplate, Error>({
    queryKey: documentKeys.template(templateId),
    queryFn: () => documentsApi.getTemplate(Number(templateId)),
    enabled: !!templateId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/**
 * Generate a document from a template.
 */
export function useDocumentGenerate() {
  return useMutation<DocumentGenerateResponse, Error, DocumentGenerateRequest>({
    mutationFn: (data) => documentsApi.generate(data),
  });
}
