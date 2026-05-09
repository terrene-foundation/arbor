"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { ConversationSummary } from "@/components/advisory";

/* ── Types ────────────────────────────────────────────────── */

interface AdvisoryPanelState {
  isOpen: boolean;
  conversations: ConversationSummary[];
  activeConversationId: number | null;
  pendingQuestion: string | null;
  /** True when the current pathname starts with /advisory */
  isAdvisoryPage: boolean;
}

interface AdvisoryPanelAPI {
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Opens panel and prefills a question to auto-send */
  askQuestion: (question: string) => void;
  startNewConversation: () => void;
  setActiveConversation: (id: number) => void;
  addConversation: (conv: ConversationSummary) => void;
  clearPendingQuestion: () => void;
}

type AdvisoryPanelContextValue = AdvisoryPanelState & AdvisoryPanelAPI;

/* ── Storage key ─────────────────────────────────────────── */

const ACTIVE_CONV_KEY = "arbor-advisory-active-conv";

function getInitialActiveConversation(): number | null {
  /* SSR-safe lazy-init: read sessionStorage on the client only. The provider
   * is a `"use client"` component so the SSR pass returns null; on hydration,
   * client first render reads the stored value. The persist effect below
   * keeps storage in sync on subsequent changes. */
  if (typeof window === "undefined") return null;
  const stored = sessionStorage.getItem(ACTIVE_CONV_KEY);
  if (stored === null) return null;
  const parsed = parseInt(stored, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/* ── Context ─────────────────────────────────────────────── */

const AdvisoryPanelContext = createContext<AdvisoryPanelContextValue | null>(
  null,
);

/* ── Provider ────────────────────────────────────────────── */

export function AdvisoryPanelProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdvisoryPage = pathname.startsWith("/advisory");

  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    number | null
  >(getInitialActiveConversation);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  /* Persist active conversation to sessionStorage */
  useEffect(() => {
    if (activeConversationId !== null) {
      sessionStorage.setItem(ACTIVE_CONV_KEY, String(activeConversationId));
    } else {
      sessionStorage.removeItem(ACTIVE_CONV_KEY);
    }
  }, [activeConversationId]);

  /* Auto-close panel when navigating to /advisory page.
   *
   * STRUCTURAL EXCEPTION (react-hooks/set-state-in-effect): this effect
   * synchronizes UI state to an external state change (route navigation).
   * The lint rule's documented permitted use case is "subscribe for updates
   * from some external system, calling setState in a callback function when
   * external state changes" — pathname is exactly that external system. The
   * exposed API methods (open/toggle/askQuestion) already guard against
   * setting `isOpen=true` when on advisory; this effect handles the inverse:
   * resetting to false when the user navigates TO advisory while panel is
   * open. Action-driven alternatives (deriving isOpen from rawIsOpen +
   * isAdvisoryPage) regress the "panel does not snap back open when leaving
   * advisory" UX (see workspaces/shard-d-lint/01-analysis/04-redteam-round-1.md F7).
   * Tracking: terrene-foundation/arbor#33. */
  useEffect(() => {
    if (isAdvisoryPage && isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsOpen(false);
    }
  }, [isAdvisoryPage, isOpen]);

  /* Keyboard shortcut: Ctrl+Shift+A / Cmd+Shift+A */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't fire when user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const modKey = e.metaKey || e.ctrlKey;
      if (modKey && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        if (!isAdvisoryPage) {
          setIsOpen((prev) => !prev);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAdvisoryPage]);

  /* ── API methods ──────────────────────────────────────── */

  const open = useCallback(() => {
    if (!isAdvisoryPage) {
      setIsOpen(true);
    }
  }, [isAdvisoryPage]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    if (!isAdvisoryPage) {
      setIsOpen((prev) => !prev);
    }
  }, [isAdvisoryPage]);

  const askQuestion = useCallback(
    (question: string) => {
      setPendingQuestion(question);
      if (!isAdvisoryPage) {
        setIsOpen(true);
      }
    },
    [isAdvisoryPage],
  );

  const startNewConversation = useCallback(() => {
    setActiveConversationId(null);
  }, []);

  const setActiveConversation = useCallback((id: number) => {
    setActiveConversationId(id);
  }, []);

  const addConversation = useCallback((conv: ConversationSummary) => {
    setConversations((prev) => {
      if (prev.some((c) => c.id === conv.id)) return prev;
      return [conv, ...prev];
    });
  }, []);

  const clearPendingQuestion = useCallback(() => {
    setPendingQuestion(null);
  }, []);

  return (
    <AdvisoryPanelContext.Provider
      value={{
        isOpen,
        conversations,
        activeConversationId,
        pendingQuestion,
        isAdvisoryPage,
        open,
        close,
        toggle,
        askQuestion,
        startNewConversation,
        setActiveConversation,
        addConversation,
        clearPendingQuestion,
      }}
    >
      {children}
    </AdvisoryPanelContext.Provider>
  );
}

/* ── Hook ─────────────────────────────────────────────────── */

export function useAdvisoryPanel(): AdvisoryPanelContextValue {
  const context = useContext(AdvisoryPanelContext);
  if (!context) {
    throw new Error(
      "useAdvisoryPanel must be used within an AdvisoryPanelProvider",
    );
  }
  return context;
}
