import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {createRouter, RouterProvider} from '@tanstack/react-router';
import {routeTree} from './routeTree.gen';
import './index.css';

// The router-plugin generates the `Register` module augmentation (which wires
// `typeof router` into TanStack's type system) inside routeTree.gen.ts, so we
// must NOT declare it again here — doing so triggers TS2300 duplicate identifier.
const router = createRouter({routeTree});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
