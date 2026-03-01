import { z } from 'zod';

/**
 * Chat Summary Schema Version 1.0
 * Defines the structure of AI chat summaries for commits
 */

export const UserPromptSchema = z.object({
  timestamp: z.string().datetime(),
  content: z.string(),
  truncated: z.boolean(), // If content was truncated for size
});

export const AssistantResponseSchema = z.object({
  timestamp: z.string().datetime(),
  content: z.string(),
  truncated: z.boolean(),
  tool_uses: z.array(z.string()).optional(), // Tools used in this response (Read, Write, Edit, etc.)
  files_modified: z.array(z.string()).optional(), // Files that were modified
});

export const TokenUsageSchema = z.object({
  input_tokens: z.number().int().min(0), // Regular input tokens consumed
  output_tokens: z.number().int().min(0), // Output tokens generated
  cache_creation_input_tokens: z.number().int().min(0).optional(), // Tokens used to create prompt cache
  cache_read_input_tokens: z.number().int().min(0).optional(), // Tokens read from prompt cache (cheaper)
  total_tokens: z.number().int().min(0), // Sum of input_tokens + output_tokens (actual consumed)
});

export const ChatDataSchema = z.object({
  total_messages: z.number().int().min(0),
  user_prompts: z.array(UserPromptSchema),
  assistant_responses: z.array(AssistantResponseSchema),
  token_usage: TokenUsageSchema.optional(),
});

export const ChatSummarySchema = z.object({
  version: z.literal('1.0'),
  commit_sha: z.string().min(7).max(40),
  session_id: z.string(),
  agent_type: z.enum(['claude-code', 'cursor', 'unknown']),
  chat_data: ChatDataSchema,
  integrity_hash: z.string(), // SHA-256 of chat summary content
  generated_at: z.string().datetime(),
});

// Infer TypeScript types from schemas
export type UserPrompt = z.infer<typeof UserPromptSchema>;
export type AssistantResponse = z.infer<typeof AssistantResponseSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type ChatData = z.infer<typeof ChatDataSchema>;
export type ChatSummary = z.infer<typeof ChatSummarySchema>;

/**
 * Validates a chat summary object against the schema
 */
export function validateChatSummary(data: unknown): ChatSummary {
  return ChatSummarySchema.parse(data);
}

/**
 * Safely validates a chat summary, returning errors instead of throwing
 */
export function safeValidateChatSummary(
  data: unknown
): { success: true; data: ChatSummary } | { success: false; error: z.ZodError } {
  const result = ChatSummarySchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
