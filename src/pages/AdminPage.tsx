import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { createNodeFmRuntime } from '../nodefmRuntime';
import { isAdminAddress } from '../admin/adminAuth';
import { useQortalAuth } from '../hooks/useQortalAuth';
import '../style.css';

function AdminPage() {
  const runtimeRef = useRef<ReturnType<typeof createNodeFmRuntime> | null>(null);
  const { auth } = useQortalAuth();

  const userProfile = useMemo(() => {
    const name = auth.name || 'Loading user...';
    const address = auth.address || '';
    const avatarUrl = auth.avatarUrl || '/nodefm_logo.png';

    return {
      name,
      address,
      avatarUrl,
    };
  }, [auth.name, auth.address, auth.avatarUrl]);

  const isAdmin = isAdminAddress(userProfile.address);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const runtime = createNodeFmRuntime();
    runtimeRef.current = runtime;
    void runtime.bootstrap();

    return () => {
      runtime.destroy();
      runtimeRef.current = null;
    };
  }, [isAdmin]);

  useEffect(() => {
    runtimeRef.current?.setUserProfile(userProfile);
  }, [userProfile]);

  return (
    <div className="app-shell admin-page-shell">
      <header className="admin-page-topbar">
        <div className="user-chip user-chip-wide">
          <img id="user-avatar" className="user-avatar" src="" alt="Qortal user avatar" />
          <div className="user-meta">
            <p id="user-name" className="user-name">
              Loading user...
            </p>
          </div>
        </div>
        <Link className="back-frontpage-btn" to="/">
          Back to Frontpage
        </Link>
      </header>

      {isAdmin ? (
        <section id="admin-panel" className="admin-panel admin-panel-page" aria-live="polite">
          <header className="admin-header">
            <div>
              <h3>NodeFM Admin Panel</h3>
              <p className="admin-subtitle">Playlist operations, QDN upload and radio analytics</p>
            </div>
          </header>

          <div className="admin-grid">
            <div className="admin-column">
              <article className="admin-card">
                <h4>QDN Stats</h4>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span>Total songs on QDN</span>
                    <strong id="stat-total-songs">0</strong>
                  </div>
                  <div className="stat-item">
                    <span>Saved playlists</span>
                    <strong id="stat-total-playlists">0</strong>
                  </div>
                  <div className="stat-item">
                    <span>Total runtime</span>
                    <strong id="stat-total-duration">00:00</strong>
                  </div>
                </div>
              </article>

              <article className="admin-card">
                <h4>Upload to QDN</h4>
                <div className="admin-form-grid">
                  <label>
                    Track title
                    <input id="upload-title" type="text" placeholder="Example: Night Protocol" />
                  </label>
                  <label>
                    Audio file
                    <input id="upload-audio" type="file" accept="audio/*" />
                  </label>
                  <label>
                    Thumbnail
                    <input id="upload-cover" type="file" accept="image/*" />
                  </label>
                </div>
                <button id="upload-qdn-btn" className="admin-action-btn" type="button">
                  Upload Resource
                </button>
              </article>

              <article className="admin-card">
                <h4>Playlist Builder</h4>
                <div className="admin-form-grid">
                  <label>
                    New playlist name
                    <input id="playlist-name-input" type="text" placeholder="Night Shift Mix" />
                  </label>
                  <button id="save-playlist-btn" className="admin-action-btn" type="button">
                    Save Current Queue
                  </button>
                  <label>
                    Load saved playlist
                    <select id="playlist-select"></select>
                  </label>
                  <button id="load-playlist-btn" className="admin-action-btn secondary" type="button">
                    Load to Player
                  </button>
                </div>
              </article>

              <article className="admin-card">
                <h4>My Published Audio (QDN)</h4>
                <p id="admin-published-audio-empty" className="upcoming-empty">
                  No published audio found yet.
                </p>
                <ul id="admin-published-audio-list" className="published-audio-list"></ul>
              </article>
            </div>

            <aside className="admin-card admin-column-right">
              <h4>Now Playing Playlist (Drag and Drop)</h4>
              <ul id="admin-current-playlist" className="admin-playlist-list"></ul>
            </aside>
          </div>

          <p id="admin-message" className="admin-message">
            Admin panel ready.
          </p>

          <div id="add-track-modal" className="admin-modal-overlay" hidden>
            <div className="admin-modal">
              <div className="admin-modal-head">
                <h4>Add Track to Playlist</h4>
                <button id="add-track-close-btn" className="admin-modal-close" type="button" aria-label="Close">
                  Close
                </button>
              </div>
              <p className="admin-modal-track">
                Selected track: <strong id="add-track-modal-title">-</strong>
              </p>
              <div className="admin-form-grid">
                <label>
                  Existing playlist
                  <select id="add-track-playlist-select"></select>
                </label>
                <label>
                  Or create new playlist
                  <input id="add-track-new-playlist-name" type="text" placeholder="Example: Midnight Rotation" />
                </label>
              </div>
              <div className="admin-modal-actions">
                <button id="add-track-confirm-btn" className="admin-action-btn" type="button">
                  Add Track
                </button>
                <button id="add-track-cancel-btn" className="admin-action-btn secondary" type="button">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="admin-panel admin-panel-page">
          <header className="admin-header">
            <div>
              <h3>Access denied</h3>
              <p className="admin-subtitle">Your current wallet address is not authorized for NodeFM admin tools.</p>
            </div>
          </header>
        </section>
      )}
    </div>
  );
}

export default AdminPage;
