/* ============================================================
 * NodeFM Station — Admin Layout
 *
 * Admin layout with sidebar navigation.
 * AppRouter checks station management rights; membership is owner-only.
 * ============================================================ */

import { Link, Outlet, useLocation } from 'react-router-dom';
import { useStation } from '../features/station';

const ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', isEnd: true },
  { to: '/admin/library', label: 'Library', isEnd: false },
  { to: '/admin/playlists', label: 'Playlists', isEnd: false },
  { to: '/admin/playlist-submissions', label: 'Playlist Submissions', isEnd: false },
  { to: '/admin/schedule', label: 'Schedule', isEnd: false },
  { to: '/admin/messages', label: 'Messages', isEnd: false },
  { to: '/admin/station', label: 'Station', isEnd: false },
] as const;

export function AdminLayout() {
  const location = useLocation();
  const { isOwner } = useStation();

  return (
    <div className="layout layout--admin">
      <aside className="admin__sidebar" aria-label="Admin navigation">
        <div className="admin__sidebar-brand">
          <Link to="/admin" className="admin__sidebar-link">
            NodeFM Admin
          </Link>
        </div>
        <nav className="admin__nav">
          {isOwner && (
            <Link
              to="/admin/admins"
              className={`admin__nav-link${location.pathname === '/admin/admins' ? ' admin__nav-link--active' : ''}`}
            >
              Manage admins
            </Link>
          )}
          {ADMIN_NAV.map(({ to, label, isEnd }) => {
            const isActive = isEnd ? location.pathname === to : location.pathname.startsWith(to);

            return (
              <Link
                key={to}
                to={to}
                className={`admin__nav-link${isActive ? ' admin__nav-link--active' : ''}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="admin__sidebar-footer">
          <Link to="/" className="admin__back-link">
            ← Back to Station
          </Link>
        </div>
      </aside>

      <main className="admin__main">
        <Link to="/" className="admin__mobile-back-link">
          ← Back to Station
        </Link>
        <Outlet />
      </main>
    </div>
  );
}
