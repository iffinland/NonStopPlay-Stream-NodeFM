import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from '../App';
import { AppWrapper } from '../AppWrapper';
import AdminPage from '../pages/AdminPage';

interface CustomWindow extends Window {
  _qdnBase: string;
}
const customWindow = window as unknown as CustomWindow;
const baseUrl = customWindow?._qdnBase || '';

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppWrapper />,
      children: [
        {
          index: true,
          element: <App />,
        },
        {
          path: 'admin',
          element: <AdminPage />,
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
