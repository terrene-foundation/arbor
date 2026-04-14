/**
 * ArborAdvisoryAdapter — Bridges arbor's advisory API to Prism's ChatAdapter.
 *
 * Converts between arbor's number-based conversation IDs and Prism's string IDs,
 * and maps arbor's SSE streaming protocol to Prism's ChatStreamHandle contract.
 */

import type {
  ChatAdapter,
  ChatStreamHandle,
  ChatMessage,
  ConversationSummary,
} from "@kailash/prism-web";
import { advisoryApi } from "@/services/api/advisory";
import type {
  AdvisoryStreamStartEvent,
  AdvisoryStreamCompleteEvent,
  ConversationListItem,
  AdvisoryMessage,
} from "@/types/api";

/** Extended ConversationSummary carrying arbor-specific metadata. */
export interface ArborConversationSummary extends ConversationSummary {
  riskTier?: string;
}

function toStringId(id: number): string {
  return String(id);
}

function toNumberId(id: string): number {
  return Number(id);
}

function mapConversation(c: ConversationListItem): ArborConversationSummary {
  return {
    id: toStringId(c.id),
    title: c.title,
    lastMessage: c.last_message,
    timestamp: new Date(c.timestamp).getTime(),
    messageCount: c.message_count,
    riskTier: c.risk_tier,
  };
}

function mapMessage(m: AdvisoryMessage, index: number): ChatMessage {
  return {
    id: `msg-${index}`,
    type: m.role === "user" ? "user" : "assistant",
    content: m.content,
    timestamp: new Date(m.timestamp).getTime(),
    sender: m.role === "user" ? "user" : "assistant",
  };
}

export class ArborAdvisoryAdapter implements ChatAdapter {
  async listConversations(): Promise<ArborConversationSummary[]> {
    const response = await advisoryApi.listConversations();
    return response.conversations.map(mapConversation);
  }

  async loadMessages(conversationId: string): Promise<ChatMessage[]> {
    const response = await advisoryApi.getHistory(toNumberId(conversationId));
    return response.messages.map(mapMessage);
  }

  sendMessage(
    conversationId: string | null,
    content: string,
  ): ChatStreamHandle {
    type TokenCallback = (token: string) => void;
    type CompleteCallback = (message: ChatMessage) => void;
    type ErrorCallback = (error: Error) => void;

    let onTokenCb: TokenCallback | null = null;
    let onCompleteCb: CompleteCallback | null = null;
    let onErrorCb: ErrorCallback | null = null;

    const controller = advisoryApi.stream(
      {
        query: content,
        conversation_id: conversationId ? toNumberId(conversationId) : undefined,
      },
      {
        onStart: (_data: AdvisoryStreamStartEvent) => {
          // Conversation ID available here if needed
        },
        onToken: (token: string) => {
          onTokenCb?.(token);
        },
        onComplete: (data: AdvisoryStreamCompleteEvent) => {
          const message: ChatMessage = {
            id: `assistant-${Date.now()}`,
            type: "assistant",
            content: data.response,
            timestamp: Date.now(),
            sender: "assistant",
          };
          onCompleteCb?.(message);
        },
        onError: (error: Error) => {
          onErrorCb?.(error);
        },
      },
    );

    return {
      onToken(callback: TokenCallback) {
        onTokenCb = callback;
      },
      onComplete(callback: CompleteCallback) {
        onCompleteCb = callback;
      },
      onError(callback: ErrorCallback) {
        onErrorCb = callback;
      },
      abort() {
        controller.abort();
      },
    };
  }

  async deleteConversation(id: string): Promise<void> {
    await advisoryApi.deleteConversation(toNumberId(id));
  }

  async renameConversation(id: string, title: string): Promise<void> {
    await advisoryApi.renameConversation(toNumberId(id), title);
  }
}
