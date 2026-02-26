const STORAGE_KEY = 'nodefm.playlists.v1';

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function cloneTracks(tracks) {
  return tracks.map((track) => ({ ...track }));
}

export class PlaylistStore {
  constructor() {
    this.playlists = [];
    this.activeId = null;
    this.hydrate();
  }

  hydrate() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = safeParse(raw);

      if (!parsed || !Array.isArray(parsed.playlists)) {
        return;
      }

      this.playlists = parsed.playlists;
      this.activeId = parsed.activeId || null;
    } catch {
      this.playlists = [];
      this.activeId = null;
    }
  }

  persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          playlists: this.playlists,
          activeId: this.activeId,
        }),
      );
    } catch {
      // Ignore storage failures in embedded/limited environments.
    }
  }

  getPlaylists() {
    return this.playlists.map((playlist) => ({
      ...playlist,
      tracks: cloneTracks(playlist.tracks || []),
    }));
  }

  getActivePlaylist() {
    if (!this.activeId) {
      return null;
    }

    const playlist = this.playlists.find((item) => item.id === this.activeId);
    return playlist
      ? {
          ...playlist,
          tracks: cloneTracks(playlist.tracks || []),
        }
      : null;
  }

  saveCurrentAsPlaylist(name, tracks) {
    const trimmedName = (name || '').trim();

    if (!trimmedName) {
      throw new Error('Playlist name is required.');
    }

    if (!Array.isArray(tracks) || !tracks.length) {
      throw new Error('Cannot save an empty playlist.');
    }

    const newPlaylist = {
      id: `pl-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      name: trimmedName,
      tracks: cloneTracks(tracks),
      createdAt: Date.now(),
    };

    this.playlists.unshift(newPlaylist);
    this.activeId = newPlaylist.id;
    this.persist();

    return { ...newPlaylist, tracks: cloneTracks(newPlaylist.tracks) };
  }

  setActivePlaylist(id) {
    const playlist = this.playlists.find((item) => item.id === id);

    if (!playlist) {
      throw new Error('Selected playlist was not found.');
    }

    this.activeId = id;
    this.persist();

    return {
      ...playlist,
      tracks: cloneTracks(playlist.tracks || []),
    };
  }

  updateActiveTracks(tracks) {
    if (!this.activeId || !Array.isArray(tracks)) {
      return;
    }

    const target = this.playlists.find((item) => item.id === this.activeId);

    if (!target) {
      return;
    }

    target.tracks = cloneTracks(tracks);
    this.persist();
  }

  appendTrackToPlaylist(playlistId, track) {
    if (!playlistId) {
      throw new Error('Playlist id is required.');
    }

    if (!track || typeof track !== 'object') {
      throw new Error('Track payload is invalid.');
    }

    const target = this.playlists.find((item) => item.id === playlistId);

    if (!target) {
      throw new Error('Selected playlist was not found.');
    }

    target.tracks = [...(target.tracks || []), { ...track }];
    this.activeId = target.id;
    this.persist();

    return {
      ...target,
      tracks: cloneTracks(target.tracks || []),
    };
  }

  createPlaylistWithTrack(name, track) {
    return this.saveCurrentAsPlaylist(name, [track]);
  }
}
