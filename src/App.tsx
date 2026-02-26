import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createNodeFmRuntime } from './nodefmRuntime';
import { useQortalAuth } from './hooks/useQortalAuth';
import './style.css';

function App() {
  const runtimeRef = useRef<ReturnType<typeof createNodeFmRuntime> | null>(null);
  const { auth } = useQortalAuth();
  const navigate = useNavigate();

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

  useEffect(() => {
    const runtime = createNodeFmRuntime();
    runtimeRef.current = runtime;
    void runtime.bootstrap();

    return () => {
      runtime.destroy();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    runtimeRef.current?.setUserProfile(userProfile);
  }, [userProfile]);

  return (
    <div id="app" className="app-shell">
      <div className="layout-columns">
        <section className="left-column">
          <main className="player-card" aria-live="polite">
            <header className="player-header">
              <p className="on-air">
                <span className="dot" aria-hidden="true"></span>ON AIR
              </p>
              <h1>NodeFM</h1>
              <div className="subtitle-row">
                <p className="subtitle">Serverless Auto-DJ</p>
                <span className="experimental-badge">Experimental project</span>
              </div>
            </header>

            <section className="now-playing">
              <div className="artwork" role="img" aria-label="Album art placeholder">
                NODEFM
              </div>
              <div className="track-meta">
                <p className="label">Now Playing</p>
                <h2 id="track-title">Loading schedule...</h2>
                <p id="track-artist">-</p>
                <p id="time-remaining">Remaining: --:--</p>
              </div>
            </section>

            <section className="progress-section" aria-label="Playback progress">
              <div className="progress-bar">
                <div id="progress-fill" className="progress-fill"></div>
              </div>
              <div className="time-row">
                <span id="elapsed-time">00:00</span>
                <span id="total-time">00:00</span>
              </div>
            </section>

            <section className="controls">
              <div className="control-row">
                <button id="tune-in-btn" className="tune-btn">
                  Tune In
                </button>
                <button id="stop-btn" className="stop-btn" disabled>
                  Stop
                </button>
              </div>
              <p id="status" className="status">
                Ready to connect.
              </p>
            </section>
          </main>

          <section className="upcoming-card" aria-live="polite">
            <header className="upcoming-header">
              <h3>Next Upcoming Songs</h3>
              <p className="upcoming-subtitle">Server-calculated queue preview</p>
            </header>
            <p id="upcoming-empty" className="upcoming-empty">
              Loading upcoming tracks...
            </p>
            <ul id="upcoming-list" className="upcoming-list" aria-label="Upcoming songs"></ul>
          </section>
        </section>

        <aside className="right-column">
          <header className="session-header" aria-label="Session controls">
            <div className="session-controls">
              <button
                id="admin-login-btn"
                className="admin-login-btn"
                hidden
                onClick={() => navigate('/admin')}
                type="button"
              >
                Admin Login
              </button>
              <div className="user-chip">
                <img id="user-avatar" className="user-avatar" src="" alt="Qortal user avatar" />
                <div className="user-meta">
                  <p id="user-name" className="user-name">
                    Loading user...
                  </p>
                </div>
              </div>
            </div>
          </header>

          <section className="sidebar-shell">
            <header className="sidebar-header">
              <h3>Sidebar</h3>
              <p className="sidebar-subtitle">Reserved for NodeFM management tools</p>
            </header>
            <div className="sidebar-placeholder"></div>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default App;
