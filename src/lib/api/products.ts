/**
 * Products / OwnedItems resource (#84, #101) — catalog list/get/patch,
 * merge, recompute, and the owned-items inventory list.
 *
 * Thin pass-throughs to openapi-fetch; no business logic. Imports shared
 * things from `./core` only; `components` comes from the generated
 * api-types.
 */
import type { components } from '@/lib/api-types';
import { client, unwrap } from './core';
import type { BackendProduct, BackendOwnedItem } from './core';

export interface ListProductsOptions {
  class?: 'durable' | 'consumable' | 'food_drink' | 'service' | 'other';
  brand_id?: string;
  merchant_id?: string;
  search?: string;
  limit?: number;
}

export async function listProducts(opts: ListProductsOptions = {}): Promise<BackendProduct[]> {
  // The catalog's free-text filter is the contract's `q` param (the backend
  // ILIKEs name/custom_name/product_key). The UI calls it `search`; map it
  // here. (Sending `search` was silently dropped by the server → #129.)
  const { search, ...rest } = opts;
  const { data, error, response } = await client.GET('/v1/products', {
    params: { query: { ...rest, q: search?.trim() || undefined } },
  });
  return unwrap('listProducts', data, error, response.status).items;
}

export async function getProduct(id: string): Promise<BackendProduct> {
  const { data, error, response } = await client.GET('/v1/products/{id}', {
    params: { path: { id } },
  });
  return unwrap('getProduct', data, error, response.status);
}

export async function patchProduct(
  id: string,
  patch: components['schemas']['UpdateProductRequest'],
): Promise<BackendProduct> {
  const { data, error, response } = await client.PATCH('/v1/products/{id}', {
    params: { path: { id } },
    body: patch,
  });
  return unwrap('patchProduct', data, error, response.status);
}

export type MergeProductResult = components['schemas']['MergeProductResponse'];

export async function mergeProductInto(
  sourceId: string,
  targetId: string,
): Promise<MergeProductResult> {
  const { data, error, response } = await client.POST('/v1/products/{id}/merge_into', {
    params: { path: { id: sourceId } },
    body: { target_id: targetId },
  });
  return unwrap('mergeProductInto', data, error, response.status);
}

export interface RecomputeProductResult {
  id: string;
  purchase_count: number;
  total_spent_minor: number;
  first_purchased_on: string | null;
  last_purchased_on: string | null;
}

export async function recomputeProduct(id: string): Promise<RecomputeProductResult> {
  const { data, error, response } = await client.POST('/v1/products/{id}/recompute', {
    params: { path: { id } },
  });
  return unwrap('recomputeProduct', data, error, response.status);
}

export async function listOwnedItems(opts: {
  product_id?: string;
  location?: string;
  include_retired?: boolean;
  limit?: number;
} = {}): Promise<BackendOwnedItem[]> {
  const { data, error, response } = await client.GET('/v1/owned-items', {
    params: { query: opts },
  });
  return unwrap('listOwnedItems', data, error, response.status).items;
}
