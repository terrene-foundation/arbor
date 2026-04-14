"use client";

/**
 * PrismDocumentCard — local card molecule used by the Prism documents page
 * in grid mode. This lives in arbor because @kailash/prism-web 0.1.0 does not
 * yet ship a reusable `Card` atom or a `CardGrid` molecule.
 *
 * Proposed upstream shape (see migration-m03-findings.md §
 * "New Prism atoms/molecules needed"): a generic `Card` atom taking a title,
 * metadata slot, body slot, and actions slot. When that lands in Prism, this
 * component deletes and the page imports `Card` from `@kailash/prism-web`.
 *
 * The card is intentionally styled via CSS custom properties from the Prism
 * theme engine so it matches the rest of the Prism page without depending on
 * arbor's bespoke design tokens.
 */

import type { CSSProperties } from "react";
import Link from "next/link";
import {
  FileText,
  FileSignature,
  BookOpen,
  Mail,
  ClipboardList,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { Badge, Button } from "@kailash/prism-web";
import type { DocumentTemplate } from "@/types/api";

const categoryIcon: Record<string, LucideIcon> = {
  Contracts: FileSignature,
  Policies: BookOpen,
  Letters: Mail,
  Forms: ClipboardList,
};

const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 16,
  borderRadius: "var(--prism-radius-md, 8px)",
  border:
    "1px solid var(--prism-color-border-default, #E2E8F0)",
  backgroundColor: "var(--prism-color-surface-page, #FFFFFF)",
  height: "100%",
  minHeight: 200,
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
};

const iconBoxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: "var(--prism-radius-md, 6px)",
  backgroundColor:
    "var(--prism-color-interactive-primary-subtle, #EFF6FF)",
  color: "var(--prism-color-interactive-primary, #1E3A5F)",
  flexShrink: 0,
};

const titleBlockStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0,
  flex: 1,
};

const titleStyle: CSSProperties = {
  fontSize: "var(--prism-font-size-body, 14px)",
  fontWeight: 600,
  color: "var(--prism-color-text-primary, #0F172A)",
  lineHeight: 1.3,
  margin: 0,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical" as const,
  overflow: "hidden",
};

const descStyle: CSSProperties = {
  fontSize: "var(--prism-font-size-caption, 12px)",
  color: "var(--prism-color-text-secondary, #64748B)",
  lineHeight: 1.5,
  margin: 0,
  flex: 1,
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical" as const,
  overflow: "hidden",
};

const complianceStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 6,
  padding: 8,
  borderRadius: "var(--prism-radius-sm, 4px)",
  backgroundColor: "var(--prism-color-surface-elevated, #F8FAFC)",
  fontSize: "var(--prism-font-size-caption, 11px)",
  color: "var(--prism-color-text-secondary, #64748B)",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  paddingTop: 8,
  borderTop:
    "1px solid var(--prism-color-border-default, #E2E8F0)",
};

const provisionTextStyle: CSSProperties = {
  fontSize: "var(--prism-font-size-caption, 11px)",
  color: "var(--prism-color-text-tertiary, #94A3B8)",
};

const actionGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

export interface PrismDocumentCardProps {
  template: DocumentTemplate;
}

export function PrismDocumentCard({ template }: PrismDocumentCardProps) {
  const Icon = categoryIcon[template.category] ?? FileText;
  const firstComplianceNote = template.compliance_notes[0];

  return (
    <article style={cardStyle} aria-label={template.name}>
      <div style={headerRowStyle}>
        <div style={iconBoxStyle} aria-hidden="true">
          <Icon size={18} />
        </div>
        <div style={titleBlockStyle}>
          <h3 style={titleStyle}>{template.name}</h3>
          <Badge variant="default" size="sm">
            {template.category}
          </Badge>
        </div>
      </div>

      <p style={descStyle}>{template.description}</p>

      {firstComplianceNote !== undefined && (
        <div style={complianceStyle}>
          <Shield
            size={13}
            aria-hidden="true"
            style={{
              color: "var(--prism-color-interactive-primary, #1E3A5F)",
              flexShrink: 0,
              marginTop: 2,
            }}
          />
          <span>{firstComplianceNote}</span>
        </div>
      )}

      <div style={actionRowStyle}>
        <span style={provisionTextStyle}>
          {template.provisions_count} provision
          {template.provisions_count !== 1 ? "s" : ""} linked
        </span>
        <div style={actionGroupStyle}>
          <Link
            href={`/documents/${String(template.id)}/preview`}
            aria-label={`Preview ${template.name}`}
          >
            <Button variant="ghost" size="sm">
              Preview
            </Button>
          </Link>
          <Link
            href={`/documents/${String(template.id)}/generate`}
            aria-label={`Generate ${template.name}`}
          >
            <Button variant="primary" size="sm">
              Generate
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}
