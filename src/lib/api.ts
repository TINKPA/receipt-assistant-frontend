/**
 * API client for ReceiptAssistant backend (v1 surface).
 *
 * This module is a pure barrel: the implementation lives in per-resource
 * modules under `src/lib/api/`. Because the `../lib/api` specifier resolves
 * to this file, every existing importer keeps working unchanged.
 *
 * - `./api/core` — the openapi-fetch `client`, `Backend*` aliases, RFC 7807
 *   error helpers, display mappers, and account reads. Everything shared.
 * - Resource modules import shared things from `./api/core` only; they
 *   never import each other.
 */
export * from './api/core';
export * from './api/transactions';
export * from './api/documents';
export * from './api/ingest';
export * from './api/reports';
export * from './api/merchants';
export * from './api/places';
export * from './api/products';
export * from './api/brands';
