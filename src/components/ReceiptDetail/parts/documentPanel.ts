import type { CSSProperties } from 'react';

/**
 * The open-fold panel wash, shared by the single-document
 * `OriginalReceiptCollapsible` and every row of the multi-document
 * `DocumentsCard` so the two cannot drift apart (#165).
 *
 * It lives in its own module rather than beside `DocumentBody` because
 * `react-refresh/only-export-components` is configured with
 * `allowConstantExport: true`, which permits only LITERAL constants —
 * an object expression exported from a component file still warns, and
 * the repo lints with `--max-warnings 0`.
 */
export const documentPanelStyle: CSSProperties = {
  background:
    'linear-gradient(180deg, rgba(245, 230, 195, 0.4) 0%, rgba(201, 123, 92, 0.06) 100%), var(--color-surface)',
};
