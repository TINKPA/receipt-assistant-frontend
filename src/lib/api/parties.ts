/**
 * Party-graph reads (v2 redesign P4, tracking receipt-assistant#149).
 */
import type { components } from '@/lib/api-types';
import { client, unwrap } from './core';

export type TransactionParty = components['schemas']['TransactionParty'];
export type BrandPartySummary = components['schemas']['BrandPartySummary'];

export async function listTransactionParties(
  transactionId: string,
): Promise<TransactionParty[]> {
  const { data, error, response } = await client.GET('/v1/transactions/{id}/parties', {
    params: { path: { id: transactionId } },
  });
  return unwrap('listTransactionParties', data, error, response.status).items;
}

export async function getBrandPartySummary(brandId: string): Promise<BrandPartySummary> {
  const { data, error, response } = await client.GET('/v1/brands/{brandId}/party-summary', {
    params: { path: { brandId } },
  });
  return unwrap('getBrandPartySummary', data, error, response.status);
}
