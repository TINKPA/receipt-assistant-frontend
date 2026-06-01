import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {createRouter, RouterProvider} from '@tanstack/react-router';
import {QueryClientProvider} from '@tanstack/react-query';
import {ReactQueryDevtools} from '@tanstack/react-query-devtools';
import {routeTree} from './routeTree.gen';
import {queryClient} from './lib/queryClient';
import './index.css';

// The router-plugin generates the `Register` module augmentation (which wires
// `typeof router` into TanStack's type system) inside routeTree.gen.ts, so we
// must NOT declare it again here — doing so triggers TS2300 duplicate identifier.
//
// `scrollRestoration` makes the router save/restore window scroll per location.
// It's the second half of the #89 fix: now that the Ledger's pages live in the
// TanStack Query cache (PR3), navigating into a receipt and back rehydrates the
// full list synchronously, so the page is tall again and the saved scroll
// offset actually exists to restore to. (The deprecated <ScrollRestoration/>
// component is replaced by this router option.)
const router = createRouter({routeTree, scrollRestoration: true});

// QueryClientProvider wraps the router so every route/component can use
// TanStack Query hooks. Devtools render only in dev (tree-shaken from prod
// builds via the import.meta.env.DEV guard).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </StrictMode>,
);
