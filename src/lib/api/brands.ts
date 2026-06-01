/**
 * Brands resource (#101) — list/get brands, the brand rollup, brand
 * assets, brand patch, and user-asset upload.
 *
 * Thin pass-throughs to openapi-fetch; no business logic. Imports shared
 * things from `./core` only; `components` comes from the generated
 * api-types.
 */
import type { components } from '@/lib/api-types';
import { client, unwrap } from './core';
import type { BackendBrand, BackendBrandAsset } from './core';

export async function listBrands(): Promise<BackendBrand[]> {
  const { data, error, response } = await client.GET('/v1/brands', {});
  return unwrap('listBrands', data, error, response.status).items;
}

export async function getBrand(brandId: string): Promise<BackendBrand> {
  const { data, error, response } = await client.GET('/v1/brands/{brandId}', {
    params: { path: { brandId } },
  });
  return unwrap('getBrand', data, error, response.status);
}

// Brand rollup — typed directly from the generated OpenAPI schema. The path
// `/v1/brands/{brandId}/rollup` and the BrandRollup* schemas are in the
// committed spec / api-types.ts, so this uses the typed client like every
// other endpoint (the old hand-written fetch + hand-mirrored interfaces, which
// predated the path landing in the spec, are gone).
export type BrandRollupStats = components['schemas']['BrandRollupStats'];
export type BrandRollupLocation = components['schemas']['BrandRollupLocation'];
export type BrandRollupRecentRow = components['schemas']['BrandRollupRecentRow'];
export type BrandRollupSibling = components['schemas']['BrandRollupSibling'];
export type BrandRollup = components['schemas']['BrandRollup'];

export async function fetchBrandRollup(brandId: string): Promise<BrandRollup> {
  const { data, error, response } = await client.GET('/v1/brands/{brandId}/rollup', {
    params: { path: { brandId } },
  });
  return unwrap('fetchBrandRollup', data, error, response.status);
}

export async function listBrandAssets(brandId: string): Promise<BackendBrandAsset[]> {
  const { data, error, response } = await client.GET('/v1/brands/{brandId}/assets', {
    params: { path: { brandId } },
  });
  return unwrap('listBrandAssets', data, error, response.status).items;
}

export async function patchBrand(
  brandId: string,
  patch: { name?: string; domain?: string | null; preferred_asset_id?: string | null },
): Promise<BackendBrand> {
  const { data, error, response } = await client.PATCH('/v1/brands/{brandId}', {
    params: { path: { brandId } },
    body: patch,
  });
  return unwrap('patchBrand', data, error, response.status);
}

/**
 * Upload a user-provided icon for a brand. The backend stamps
 * `user_chose_at` and points `preferred_asset_id` at the new asset —
 * the upload IS the user's choice, so re-extract (`Phase 4c`) will
 * never overwrite it. Same-bytes re-upload returns the existing row
 * 200 OK (UNIQUE on `(brand_id, content_hash)`); new bytes return 201.
 */
export async function uploadBrandAsset(
  brandId: string,
  file: File,
): Promise<BackendBrandAsset> {
  const form = new FormData();
  form.append('file', file);
  const { data, error, response } = await client.POST('/v1/brands/{brandId}/assets', {
    params: { path: { brandId } },
    body: form as unknown as Record<string, never>,
    bodySerializer: (b) => b as unknown as FormData,
  });
  return unwrap('uploadBrandAsset', data, error, response.status);
}
