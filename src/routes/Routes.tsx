import { Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from '../App';
import Layout from '../styles/Layout';

const AdminPage = lazy(() => import('../pages/AdminPage'));

interface CustomWindow extends Window {
  _qdnBase: string;
}
const customWindow = window as unknown as CustomWindow;
const baseUrl = customWindow?._qdnBase || '';

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      children: [
        {
          index: true,
          element: <App />,
        },
        {
          path: 'admin',
          element: (
            <Suspense fallback={<div style={{ padding: '16px' }}>Loading admin...</div>}>
              <AdminPage />
            </Suspense>
          ),
        },
      ],
    },
  ],
  {
    basename: baseUrl,
  },
);

export function Routes() {
  return <RouterProvider router={router} />;
}
