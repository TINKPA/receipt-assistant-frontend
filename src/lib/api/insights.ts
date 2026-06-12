/**
 * Insights resource (v2 redesign P5, tracking receipt-assistant#149) —
 * discovered cards + the natural-language ask.
 */
import type { components } from '@/lib/api-types';
import { client, unwrap } from './core';

export type Insight = components['schemas']['Insight'];
export type AskResponse = components['schemas']['AskResponse'];

export async function listInsights(): Promise<Insight[]> {
  const { data, error, response } = await client.GET('/v1/insights');
  return unwrap('listInsights', data, error, response.status).items;
}

export async function refreshInsights(): Promise<number> {
  const { data, error, response } = await client.POST('/v1/insights/refresh');
  return unwrap('refreshInsights', data, error, response.status).generated;
}

export async function dismissInsight(id: string): Promise<Insight> {
  const { data, error, response } = await client.POST('/v1/insights/{id}/dismiss', {
    params: { path: { id } },
  });
  return unwrap('dismissInsight', data, error, response.status);
}

/** Synchronous by design (~10-60s) — callers must show a thinking state. */
export async function askLedger(question: string): Promise<AskResponse> {
  const { data, error, response } = await client.POST('/v1/insights/ask', {
    body: { question },
  });
  return unwrap('askLedger', data, error, response.status);
}
