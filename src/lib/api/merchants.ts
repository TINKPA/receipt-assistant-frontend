/**
 * Merchant aggregation resource (#33) — merchant detail, its transactions,
 * and the brand-level `custom_name` override patch.
 *
 * Imports shared things from `./core` only; `components` (the codegen type
 * namespace) comes straight from the generated api-types.
 */
import type { components } from '@/lib/api-types';
import { client, unwrap } from './core';

export type MerchantDetailResponse =
  components['schemas']['MerchantDetail'];
export type MerchantTransactionsResponse =
  components['schemas']['MerchantTransactionsResponse'];
export type MerchantTransactionRow =
  components['schemas']['MerchantTransactionRow'];

export async function fetchMerchant(id: string): Promise<MerchantDetailResponse> {
  const { data, error, response } = await client.GET('/v1/merchants/{id}', {
    params: { path: { id } },
  });
  return unwrap('fetchMerchant', data, error, response.status);
}

export async function fetchMerchantTransactions(
  id: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<MerchantTransactionsResponse> {
  const { data, error, response } = await client.GET(
    '/v1/merchants/{id}/transactions',
    {
      params: {
        path: { id },
        query: {
          limit: opts.limit,
          cursor: opts.cursor,
        },
      },
    },
  );
  return unwrap('fetchMerchantTransactions', data, error, response.status);
}

/**
 * Update the user-overridable `custom_name` on a merchant (#79 Phase C).
 * One rename propagates to every place row under this brand_id within
 * the workspace — solves the "I've been to 5 Costcos and renamed it 5
 * times" pain. Per-place override (`patchPlace`) still wins when set.
 * Pass `null` to clear.
 */
export async function patchMerchant(
  id: string,
  patch: { custom_name?: string | null },
): Promise<components['schemas']['Merchant']> {
  const { data, error, response } = await client.PATCH('/v1/merchants/{id}', {
    params: { path: { id } },
    body: patch,
  });
  return unwrap('patchMerchant', data, error, response.status);
}
