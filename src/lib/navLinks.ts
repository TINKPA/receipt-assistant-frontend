/**
 * Typed Link target builders for the app's detail screens.
 *
 * List rows render as real `<a href>` via TanStack's <Link {...receiptLink(id)}>
 * instead of `<button onClick={navigate(...)}>`. That restores native browser
 * affordances the JS-only path lost: right-click → Open in New Tab / Split
 * View, Cmd/Ctrl-click, middle-click, and the hover URL preview.
 *
 * Spreading one of these onto <Link> gives it the correct `to` + `params`
 * (and TanStack type-checks the pair against the generated route tree).
 */
export const receiptLink = (receiptId: string) =>
  ({ to: '/receipt/$receiptId', params: { receiptId } }) as const;

export const merchantLink = (merchantId: string) =>
  ({ to: '/merchant/$merchantId', params: { merchantId } }) as const;

export const brandLink = (brandId: string) =>
  ({ to: '/brand/$brandId', params: { brandId } }) as const;

export const batchLink = (batchId: string) =>
  ({ to: '/batches/$batchId', params: { batchId } }) as const;
