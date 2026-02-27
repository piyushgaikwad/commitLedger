import { createHash } from 'crypto';

/**
 * Computes SHA-256 hash of a string
 */
export function computeSHA256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Computes integrity hash for a receipt
 * Excludes the integrity_hash field itself to avoid circular dependency
 */
export function computeReceiptHash(receipt: Record<string, unknown>): string {
  // Create a copy without integrity_hash field
  const { integrity_hash: _ignored, ...receiptWithoutHash } = receipt;

  // Convert to stable JSON string (sorted keys)
  const stableJSON = JSON.stringify(receiptWithoutHash, Object.keys(receiptWithoutHash).sort());

  return computeSHA256(stableJSON);
}

/**
 * Verifies integrity hash of a receipt
 */
export function verifyReceiptHash(receipt: Record<string, unknown>): boolean {
  const expectedHash = receipt.integrity_hash;
  if (typeof expectedHash !== 'string') {
    return false;
  }

  const computedHash = computeReceiptHash(receipt);
  return computedHash === expectedHash;
}
