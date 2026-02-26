import { formatTime } from '../utils/time.js';

function cloneTracks(tracks) {
  return (tracks || []).map((track) => ({ ...track }));
}

export class AdminPanel {
  constructor(elements, handlers = {}) {
    this.elements = elements;
    this.handlers = handlers;
    this.currentTracks = [];
    this.publishedAudio = [];
    this.dragIndex = null;
    this.pendingAddTrack = null;

    this.bindEvents();
  }

  bindEvents() {
    this.elements.toggleButton?.addEventListener('click', () => {
      this.toggle();
    });

    this.elements.closeButton?.addEventListener('click', () => {
      this.close();
    });

    this.elements.savePlaylistButton?.addEventListener('click', async () => {
      const name = this.elements.playlistNameInput?.value || '';

      if (!name.trim()) {
        this.setMessage('Please enter a playlist name.', true);
        return;
      }

      if (!this.currentTracks.length) {
        this.setMessage('Current queue is empty.', true);
        return;
      }

      try {
        const created = await this.handlers.onSavePlaylist?.(name, cloneTracks(this.currentTracks));
        this.elements.playlistNameInput.value = '';
        this.setMessage(`Playlist "${created?.name || name}" saved.`);
      } catch (error) {
        this.setMessage(error.message || 'Failed to save playlist.', true);
      }
    });

    this.elements.loadPlaylistButton?.addEventListener('click', () => {
      const playlistId = this.elements.playlistSelect?.value;

      if (!playlistId) {
        this.setMessage('Select a playlist first.', true);
        return;
      }

      try {
        const loaded = this.handlers.onLoadPlaylist?.(playlistId);

        if (loaded?.tracks) {
          this.setCurrentTracks(loaded.tracks);
        }

        this.setMessage(`Playlist "${loaded?.name || 'Selected'}" loaded to player.`);
      } catch (error) {
        this.setMessage(error.message || 'Failed to load playlist.', true);
      }
    });

    this.elements.uploadButton?.addEventListener('click', async () => {
      const title = this.elements.uploadTitleInput?.value.trim() || '';
      const audioFile = this.elements.audioInput?.files?.[0] || null;
      const coverFile = this.elements.coverInput?.files?.[0] || null;

      if (!title || !audioFile) {
        this.setMessage('Track title and audio file are required.', true);
        return;
      }

      this.setMessage('Uploading to QDN...');

      try {
        await this.handlers.onUpload?.({
          title,
          audioFile,
          coverFile,
        });

        this.elements.uploadTitleInput.value = '';
        this.elements.audioInput.value = '';
        this.elements.coverInput.value = '';
        this.setMessage('Upload request sent successfully.');
      } catch (error) {
        this.setMessage(error.message || 'Upload failed.', true);
      }
    });

    this.elements.addTrackCancelButton?.addEventListener('click', () => {
      this.closeAddToPlaylistModal();
    });

    this.elements.addTrackCloseButton?.addEventListener('click', () => {
      this.closeAddToPlaylistModal();
    });

    this.elements.addTrackConfirmButton?.addEventListener('click', async () => {
      await this.confirmAddToPlaylist();
    });

    this.elements.addTrackModal?.addEventListener('click', (event) => {
      if (event.target === this.elements.addTrackModal) {
        this.closeAddToPlaylistModal();
      }
    });
  }

  setVisibility(isAdmin) {
    if (!this.elements.toggleButton) {
      return;
    }

    this.elements.toggleButton.hidden = !isAdmin;

    if (!isAdmin) {
      this.close();
    }
  }

  open() {
    if (!this.elements.root) {
      return;
    }

    this.elements.root.hidden = false;

    if (this.elements.toggleButton) {
      this.elements.toggleButton.textContent = 'Close Admin';
    }
  }

  close() {
    if (!this.elements.root) {
      return;
    }

    this.elements.root.hidden = true;

    if (this.elements.toggleButton) {
      this.elements.toggleButton.textContent = 'Admin Login';
    }
  }

  toggle() {
    if (!this.elements.root) {
      return;
    }

    if (this.elements.root.hidden) {
      this.open();
      return;
    }

    this.close();
  }

  setMessage(message, isError = false) {
    if (!this.elements.message) {
      return;
    }

    this.elements.message.textContent = message;
    this.elements.message.style.color = isError ? '#ff9aa8' : '#98a6c5';
  }

  setStats(stats) {
    if (!stats) {
      return;
    }

    if (this.elements.statSongs) {
      this.elements.statSongs.textContent = String(stats.totalSongsQdn ?? 0);
    }

    if (this.elements.statPlaylists) {
      this.elements.statPlaylists.textContent = String(stats.totalPlaylists ?? 0);
    }

    if (this.elements.statDuration) {
      this.elements.statDuration.textContent = formatTime(stats.totalDuration ?? 0);
    }
  }

  setSavedPlaylists(playlists, activeId = null) {
    if (!this.elements.playlistSelect) {
      return;
    }

    const select = this.elements.playlistSelect;
    select.replaceChildren();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select playlist';
    select.append(placeholder);

    playlists.forEach((playlist) => {
      const option = document.createElement('option');
      option.value = playlist.id;
      const isQdn = playlist.source === 'qdn';
      option.textContent = isQdn
        ? `${playlist.name} (QDN${playlist.ownerName ? `: ${playlist.ownerName}` : ''})`
        : playlist.name;
      select.append(option);
    });

    if (activeId) {
      select.value = activeId;
    }
  }

  setCurrentTracks(tracks) {
    this.currentTracks = cloneTracks(tracks);
    this.renderCurrentPlaylist();
  }

  setPublishedAudio(tracks) {
    this.publishedAudio = cloneTracks(tracks || []);
    this.renderPublishedAudio();
  }

  renderPublishedAudio() {
    const list = this.elements.publishedAudioList;
    const empty = this.elements.publishedAudioEmpty;

    if (!list) {
      return;
    }

    if (!this.publishedAudio.length) {
      list.replaceChildren();

      if (empty) {
        empty.hidden = false;
      }

      return;
    }

    if (empty) {
      empty.hidden = true;
    }

    const items = this.publishedAudio.map((track) => {
      const item = document.createElement('li');
      item.className = 'published-audio-item';

      const info = document.createElement('div');
      info.className = 'published-audio-meta';

      const title = document.createElement('p');
      title.className = 'published-audio-title';
      title.textContent = track.title || 'Untitled track';

      const subtitle = document.createElement('p');
      subtitle.className = 'published-audio-subtitle';
      const durationLabel = Number(track.duration) > 0 ? formatTime(track.duration) : '--:--';
      subtitle.textContent = `${track.artist || track.ownerName || 'Unknown'} • ${durationLabel}`;

      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'admin-action-btn secondary add-track-btn';
      addButton.textContent = 'Add to Playlist';
      addButton.addEventListener('click', () => {
        this.openAddToPlaylistModal(track);
      });

      info.append(title, subtitle);
      item.append(info, addButton);

      return item;
    });

    list.replaceChildren(...items);
  }

  openAddToPlaylistModal(track) {
    if (!this.elements.addTrackModal) {
      return;
    }

    this.pendingAddTrack = { ...track };

    if (this.elements.addTrackModalTitle) {
      this.elements.addTrackModalTitle.textContent = track.title || 'Untitled track';
    }

    if (this.elements.addTrackNewPlaylistInput) {
      this.elements.addTrackNewPlaylistInput.value = '';
    }

    this.populateEditablePlaylistSelect();

    this.elements.addTrackModal.hidden = false;
  }

  closeAddToPlaylistModal() {
    if (!this.elements.addTrackModal) {
      return;
    }

    this.pendingAddTrack = null;
    this.elements.addTrackModal.hidden = true;
  }

  populateEditablePlaylistSelect() {
    const select = this.elements.addTrackPlaylistSelect;

    if (!select) {
      return;
    }

    const editablePlaylists = this.handlers.onRequestEditablePlaylists?.() || [];
    select.replaceChildren();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = editablePlaylists.length
      ? 'Choose an existing playlist'
      : 'No QDN playlists yet';
    select.append(placeholder);

    editablePlaylists.forEach((playlist) => {
      const option = document.createElement('option');
      option.value = playlist.id;
      option.textContent = playlist.name;
      select.append(option);
    });
  }

  async confirmAddToPlaylist() {
    if (!this.pendingAddTrack) {
      this.setMessage('No track selected.', true);
      this.closeAddToPlaylistModal();
      return;
    }

    const playlistId = this.elements.addTrackPlaylistSelect?.value || '';
    const newPlaylistName = this.elements.addTrackNewPlaylistInput?.value.trim() || '';

    if (!playlistId && !newPlaylistName) {
      this.setMessage('Select a playlist or enter a new playlist name.', true);
      return;
    }

    try {
      await this.handlers.onAddAudioToPlaylist?.({
        audioTrack: { ...this.pendingAddTrack },
        playlistId,
        newPlaylistName,
      });

      this.setMessage(`Track "${this.pendingAddTrack.title}" added to playlist.`);
      this.closeAddToPlaylistModal();
    } catch (error) {
      this.setMessage(error.message || 'Failed to add track to playlist.', true);
    }
  }

  renderCurrentPlaylist() {
    const list = this.elements.currentPlaylist;

    if (!list) {
      return;
    }

    if (!this.currentTracks.length) {
      list.replaceChildren();
      return;
    }

    const items = this.currentTracks.map((track, index) => {
      const item = document.createElement('li');
      item.className = 'admin-track-item';
      item.draggable = true;
      item.dataset.index = String(index);

      const grip = document.createElement('span');
      grip.className = 'admin-track-grip';
      grip.textContent = '::';

      const meta = document.createElement('div');
      meta.className = 'admin-track-meta';

      const title = document.createElement('p');
      title.className = 'admin-track-title';
      title.textContent = track.title;

      const artist = document.createElement('p');
      artist.className = 'admin-track-artist';
      artist.textContent = track.artist;

      const duration = document.createElement('span');
      duration.className = 'admin-track-duration';
      duration.textContent = formatTime(track.duration);

      meta.append(title, artist);
      item.append(grip, meta, duration);

      item.addEventListener('dragstart', () => {
        this.dragIndex = Number(item.dataset.index);
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', () => {
        this.dragIndex = null;
        item.classList.remove('dragging');
      });

      item.addEventListener('dragover', (event) => {
        event.preventDefault();
      });

      item.addEventListener('drop', (event) => {
        event.preventDefault();

        const targetIndex = Number(item.dataset.index);

        if (Number.isNaN(targetIndex) || this.dragIndex === null || targetIndex === this.dragIndex) {
          return;
        }

        this.reorderTracks(this.dragIndex, targetIndex);
      });

      return item;
    });

    list.replaceChildren(...items);
  }

  async reorderTracks(fromIndex, toIndex) {
    const next = cloneTracks(this.currentTracks);
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    this.currentTracks = next;
    this.renderCurrentPlaylist();

    try {
      await this.handlers.onReorderTracks?.(cloneTracks(next));
      this.setMessage('Current playlist order updated.');
    } catch (error) {
      this.setMessage(error.message || 'Failed to reorder tracks.', true);
    }
  }
}
