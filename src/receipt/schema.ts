import { z } from 'zod';

/**
 * Receipt Schema Version 1.0
 * Defines the structure of an AI Commit Receipt
 */

export const CommitMetadataSchema = z.object({
  sha: z.string().min(7).max(40), // Git SHA (short or full)
  branch: z.string().min(1),
  author: z.string().min(1),
  email: z.string().email(),
  timestamp: z.string().datetime(),
  message: z.string(),
});

export const AgentMetadataSchema = z
  .object({
    agent_type: z.enum(['claude-code', 'cursor', 'unknown']),
    session_id: z.string(),
    confidence_score: z.number().min(0).max(1),
  })
  .nullable();

export const DiffStatisticsSchema = z.object({
  files_changed: z.number().int().min(0),
  insertions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  changed_files: z.array(z.string()),
});

export const VerificationStatusSchema = z
  .object({
    tests_run: z.boolean().optional(),
    policies_checked: z.array(z.string()).optional(),
    validation_errors: z.array(z.string()).optional(),
  })
  .optional();

export const ReceiptSchema = z.object({
  version: z.literal('1.0'),
  commit_metadata: CommitMetadataSchema,
  agent_metadata: AgentMetadataSchema,
  diff_statistics: DiffStatisticsSchema,
  verification_status: VerificationStatusSchema,
  integrity_hash: z.string(), // SHA-256 of receipt content
  generated_at: z.string().datetime(),
});

// Infer TypeScript types from schemas
export type CommitMetadata = z.infer<typeof CommitMetadataSchema>;
export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;
export type DiffStatistics = z.infer<typeof DiffStatisticsSchema>;
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type Receipt = z.infer<typeof ReceiptSchema>;

/**
 * Validates a receipt object against the schema
 */
export function validateReceipt(data: unknown): Receipt {
  return ReceiptSchema.parse(data);
}

/**
 * Safely validates a receipt, returning errors instead of throwing
 */
export function safeValidateReceipt(
  data: unknown
): { success: true; data: Receipt } | { success: false; error: z.ZodError } {
  const result = ReceiptSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
