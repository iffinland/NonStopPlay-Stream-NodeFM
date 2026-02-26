import {
  fetchPublishedAudioTracks,
  fetchPublishedPlaylists,
  fetchQdnStats,
  fetchSchedule,
  publishPlaylistToQdn,
  updatePlaylistInQdn,
  uploadToQdn,
} from './services/qortalBridge.js';
import { RadioScheduler } from './logic/scheduler.js';
import { AudioPlayer } from './logic/audioPlayer.js';
import { getUpcomingTracks } from './logic/upcomingSongs.js';
import { UpcomingSongsPanel } from './components/upcomingSongsPanel.js';
import { formatTime } from './utils/time.js';
import { isAdminAddress } from './admin/adminAuth.js';
import { AdminPanel } from './admin/adminPanel.js';

export function createNodeFmRuntime() {
  const ui = {
    title: document.getElementById('track-title'),
    artist: document.getElementById('track-artist'),
    remaining: document.getElementById('time-remaining'),
    elapsed: document.getElementById('elapsed-time'),
    total: document.getElementById('total-time'),
    progress: document.getElementById('progress-fill'),
    tuneButton: document.getElementById('tune-in-btn'),
    stopButton: document.getElementById('stop-btn'),
    status: document.getElementById('status'),
    upcomingList: document.getElementById('upcoming-list'),
    upcomingEmpty: document.getElementById('upcoming-empty'),
    userName: document.getElementById('user-name'),
    userAvatar: document.getElementById('user-avatar'),
    adminLoginButton: document.getElementById('admin-login-btn'),
    adminPanelRoot: document.getElementById('admin-panel'),
    adminCloseButton: document.getElementById('admin-close-btn'),
    adminMessage: document.getElementById('admin-message'),
    statSongs: document.getElementById('stat-total-songs'),
    statPlaylists: document.getElementById('stat-total-playlists'),
    statDuration: document.getElementById('stat-total-duration'),
    uploadTitleInput: document.getElementById('upload-title'),
    uploadAudioInput: document.getElementById('upload-audio'),
    uploadCoverInput: document.getElementById('upload-cover'),
    uploadButton: document.getElementById('upload-qdn-btn'),
    playlistNameInput: document.getElementById('playlist-name-input'),
    savePlaylistButton: document.getElementById('save-playlist-btn'),
    playlistSelect: document.getElementById('playlist-select'),
    loadPlaylistButton: document.getElementById('load-playlist-btn'),
    adminCurrentPlaylist: document.getElementById('admin-current-playlist'),
    publishedAudioList: document.getElementById('admin-published-audio-list'),
    publishedAudioEmpty: document.getElementById('admin-published-audio-empty'),
    addTrackModal: document.getElementById('add-track-modal'),
    addTrackModalTitle: document.getElementById('add-track-modal-title'),
    addTrackPlaylistSelect: document.getElementById('add-track-playlist-select'),
    addTrackNewPlaylistInput: document.getElementById('add-track-new-playlist-name'),
    addTrackConfirmButton: document.getElementById('add-track-confirm-btn'),
    addTrackCancelButton: document.getElementById('add-track-cancel-btn'),
    addTrackCloseButton: document.getElementById('add-track-close-btn'),
  };

  const scheduler = new RadioScheduler();
  const audioPlayer = new AudioPlayer();
  const upcomingPanel = new UpcomingSongsPanel(ui.upcomingList, ui.upcomingEmpty);

  let scheduleData = null;
  let isTunedIn = false;
  let activeTrackIndex = -1;
  let qdnBaseStats = null;
  let currentUserProfile = null;
  let qdnPlaylists = [];
  let publishedAudioTracks = [];
  let selectedPlaylistId = '';
  let tickIntervalId = null;
  let isBootstrapped = false;

  const adminPanel = new AdminPanel(
    {
      root: ui.adminPanelRoot,
      toggleButton: ui.adminLoginButton,
      closeButton: ui.adminCloseButton,
      message: ui.adminMessage,
      statSongs: ui.statSongs,
      statPlaylists: ui.statPlaylists,
      statDuration: ui.statDuration,
      uploadTitleInput: ui.uploadTitleInput,
      audioInput: ui.uploadAudioInput,
      coverInput: ui.uploadCoverInput,
      uploadButton: ui.uploadButton,
      playlistNameInput: ui.playlistNameInput,
      savePlaylistButton: ui.savePlaylistButton,
      playlistSelect: ui.playlistSelect,
      loadPlaylistButton: ui.loadPlaylistButton,
      currentPlaylist: ui.adminCurrentPlaylist,
      publishedAudioList: ui.publishedAudioList,
      publishedAudioEmpty: ui.publishedAudioEmpty,
      addTrackModal: ui.addTrackModal,
      addTrackModalTitle: ui.addTrackModalTitle,
      addTrackPlaylistSelect: ui.addTrackPlaylistSelect,
      addTrackNewPlaylistInput: ui.addTrackNewPlaylistInput,
      addTrackConfirmButton: ui.addTrackConfirmButton,
      addTrackCancelButton: ui.addTrackCancelButton,
      addTrackCloseButton: ui.addTrackCloseButton,
    },
    {
      onSavePlaylist: async (name, tracks) => {
        const published = await publishPlaylistToQdn({
          ownerName: currentUserProfile?.name,
          playlistName: name,
          tracks,
        });

        await refreshQdnPlaylists();

        const createdQdn = qdnPlaylists.find(
          (item) =>
            item.identifier === published.identifier &&
            item.ownerName === (currentUserProfile?.name || item.ownerName),
        );

        if (createdQdn) {
          selectedPlaylistId = createdQdn.id;
          refreshPlaylistDropdown(selectedPlaylistId);
          return createdQdn;
        }

        return {
          id: `qdn:${currentUserProfile?.name || 'unknown'}:${published.identifier}`,
          identifier: published.identifier,
          ownerName: currentUserProfile?.name || '',
          name,
          tracks,
          source: 'qdn',
        };
      },
      onLoadPlaylist: (playlistId) => {
        const loaded = qdnPlaylists.find((item) => item.id === playlistId) || null;

        if (!loaded) {
          throw new Error('Selected playlist was not found.');
        }

        scheduleData = {
          ...scheduleData,
          tracks: loaded.tracks,
        };
        selectedPlaylistId = loaded.id;
        adminPanel.setCurrentTracks(scheduleData.tracks);
        refreshPlaylistDropdown(selectedPlaylistId);
        void tick();
        return loaded;
      },
      onUpload: async (payload) => {
        const result = await uploadToQdn({
          ...payload,
          ownerName: currentUserProfile?.name,
        });
        await refreshPublishedAudio();
        return result;
      },
      onRequestEditablePlaylists: () =>
        qdnPlaylists.filter((playlist) => playlist.ownerName === (currentUserProfile?.name || '')),
      onAddAudioToPlaylist: async ({ audioTrack, playlistId, newPlaylistName }) => {
        const normalizedTrack = {
          title: audioTrack.title || 'Untitled track',
          artist: audioTrack.artist || audioTrack.ownerName || 'Unknown Artist',
          duration: Number.isFinite(Number(audioTrack.duration)) ? Number(audioTrack.duration) : 0,
          url: audioTrack.url,
        };

        if (!normalizedTrack.url) {
          throw new Error('Selected audio resource has no playback URL.');
        }

        let targetPlaylist = null;

        if (playlistId) {
          const existing = qdnPlaylists.find((item) => item.id === playlistId);

          if (!existing) {
            throw new Error('Selected QDN playlist was not found.');
          }

          if (existing.ownerName !== (currentUserProfile?.name || '')) {
            throw new Error('You can update only playlists published by your own name.');
          }

          const nextTracks = [...existing.tracks, normalizedTrack];

          await updatePlaylistInQdn({
            ownerName: currentUserProfile?.name,
            identifier: existing.identifier,
            playlistName: existing.name,
            tracks: nextTracks,
            createdAt: existing.createdAt,
          });

          await refreshQdnPlaylists();
          targetPlaylist =
            qdnPlaylists.find((item) => item.id === existing.id) || {
              ...existing,
              tracks: nextTracks,
            };
        } else {
          if (!newPlaylistName) {
            throw new Error('New playlist name is required.');
          }

          const published = await publishPlaylistToQdn({
            ownerName: currentUserProfile?.name,
            playlistName: newPlaylistName,
            tracks: [normalizedTrack],
          });

          await refreshQdnPlaylists();
          targetPlaylist =
            qdnPlaylists.find(
              (item) =>
                item.identifier === published.identifier &&
                item.ownerName === (currentUserProfile?.name || item.ownerName),
            ) || null;
        }

        if (!targetPlaylist) {
          throw new Error('Playlist saved to QDN, but reload failed. Try refreshing the page.');
        }

        selectedPlaylistId = targetPlaylist.id;
        refreshPlaylistDropdown(selectedPlaylistId);
        updateAdminStats();

        return targetPlaylist;
      },
      onReorderTracks: async (tracks) => {
        scheduleData = {
          ...scheduleData,
          tracks,
        };
        if (selectedPlaylistId && selectedPlaylistId.startsWith('qdn:')) {
          const selected = qdnPlaylists.find((item) => item.id === selectedPlaylistId);

          if (selected && selected.ownerName === (currentUserProfile?.name || '')) {
            await updatePlaylistInQdn({
              ownerName: currentUserProfile?.name,
              identifier: selected.identifier,
              playlistName: selected.name,
              tracks,
              createdAt: selected.createdAt,
            });
            await refreshQdnPlaylists();
          }
        }

        refreshPlaylistDropdown(selectedPlaylistId);
        void tick();
      },
    },
  );

  function updateStatus(message, isError = false) {
    if (!ui.status) {
      return;
    }

    ui.status.textContent = message;
    ui.status.style.color = isError ? '#ff8fa3' : '';
  }

  function refreshPlaylistDropdown(forcedSelectedId = '') {
    const selectedId = forcedSelectedId || selectedPlaylistId || '';
    adminPanel.setSavedPlaylists(qdnPlaylists, selectedId);
  }

  async function refreshQdnPlaylists() {
    try {
      const published = await fetchPublishedPlaylists(currentUserProfile?.name || '');
      qdnPlaylists = published;
      if (selectedPlaylistId && !qdnPlaylists.some((item) => item.id === selectedPlaylistId)) {
        selectedPlaylistId = '';
      }
      refreshPlaylistDropdown();
    } catch {
      qdnPlaylists = [];
      selectedPlaylistId = '';
      refreshPlaylistDropdown();
    }
  }

  async function refreshPublishedAudio() {
    if (!currentUserProfile?.name) {
      publishedAudioTracks = [];
      adminPanel.setPublishedAudio([]);
      updateAdminStats();
      return;
    }

    try {
      const tracks = await fetchPublishedAudioTracks(currentUserProfile.name);
      publishedAudioTracks = tracks;
      adminPanel.setPublishedAudio(tracks);
    } catch {
      publishedAudioTracks = [];
      adminPanel.setPublishedAudio([]);
    }

    updateAdminStats();
  }

  function updateAdminStats(totalDurationOverride = null) {
    const totalSongsFromQdnPlaylists = qdnPlaylists.reduce((sum, playlist) => sum + playlist.tracks.length, 0);

    adminPanel.setStats({
      totalSongsQdn: Math.max(
        qdnBaseStats?.totalSongsQdn || 0,
        totalSongsFromQdnPlaylists,
        publishedAudioTracks.length,
        scheduleData?.tracks?.length || 0,
      ),
      totalPlaylists: qdnPlaylists.length,
      totalDuration:
        totalDurationOverride ??
        scheduleData?.tracks?.reduce((sum, track) => sum + (track.duration || 0), 0) ??
        0,
    });
  }

  function setUserProfile(profile) {
    currentUserProfile = profile || null;

    const displayName = profile?.name || 'Anonymous Listener';
    const address = profile?.address || '';
    const avatarUrl = profile?.avatarUrl || '';

    if (ui.userName) {
      ui.userName.textContent = displayName;
    }

    if (ui.userAvatar && avatarUrl) {
      ui.userAvatar.src = avatarUrl;
    }

    adminPanel.setVisibility(isAdminAddress(address));

    if (profile?.name && profile?.address) {
      void refreshPublishedAudio();
      return;
    }

    publishedAudioTracks = [];
    adminPanel.setPublishedAudio([]);
    updateAdminStats();
  }

  async function tuneIn(syncResult) {
    if (!syncResult?.currentTrack) {
      updateStatus('Schedule is missing.', true);
      return;
    }

    try {
      await audioPlayer.playTrack(syncResult.currentTrack.url, syncResult.offset);
      isTunedIn = true;
      activeTrackIndex = syncResult.trackIndex;

      if (ui.tuneButton) {
        ui.tuneButton.textContent = 'Connected';
        ui.tuneButton.disabled = true;
      }

      if (ui.stopButton) {
        ui.stopButton.disabled = false;
      }

      updateStatus('Live stream is active.');
    } catch (error) {
      if (error?.code === 'AUTOPLAY_BLOCKED') {
        isTunedIn = false;

        if (ui.tuneButton) {
          ui.tuneButton.disabled = false;
          ui.tuneButton.textContent = 'Click to Listen';
        }

        if (ui.stopButton) {
          ui.stopButton.disabled = true;
        }

        updateStatus('Browser blocked autoplay. Press "Click to Listen".', true);
        return;
      }

      updateStatus(`Playback error: ${error.message}`, true);
    }
  }

  function render(syncResult) {
    if (!syncResult?.currentTrack) {
      if (ui.title) ui.title.textContent = 'No Tracks';
      if (ui.artist) ui.artist.textContent = '-';
      if (ui.remaining) ui.remaining.textContent = 'Remaining: --:--';
      if (ui.elapsed) ui.elapsed.textContent = '00:00';
      if (ui.total) ui.total.textContent = '00:00';
      if (ui.progress) ui.progress.style.width = '0%';
      upcomingPanel.render([]);
      adminPanel.setCurrentTracks([]);
      return;
    }

    const { currentTrack, offset, nextTrackIn } = syncResult;
    const progressPercent = Math.min(100, (offset / currentTrack.duration) * 100);

    if (ui.title) ui.title.textContent = currentTrack.title;
    if (ui.artist) ui.artist.textContent = currentTrack.artist;
    if (ui.remaining) ui.remaining.textContent = `Remaining: ${formatTime(nextTrackIn)}`;
    if (ui.elapsed) ui.elapsed.textContent = formatTime(offset);
    if (ui.total) ui.total.textContent = formatTime(currentTrack.duration);
    if (ui.progress) ui.progress.style.width = `${progressPercent}%`;

    const tracks = scheduleData?.tracks || [];
    const upcomingTracks = getUpcomingTracks(tracks, syncResult.trackIndex, 3);
    upcomingPanel.render(upcomingTracks);
    adminPanel.setCurrentTracks(tracks);
    updateAdminStats();
  }

  async function tick() {
    if (!scheduleData) {
      return;
    }

    const syncResult = scheduler.sync(scheduleData);
    render(syncResult);

    if (isTunedIn && syncResult.trackIndex !== activeTrackIndex) {
      try {
        await audioPlayer.playTrack(syncResult.currentTrack.url, syncResult.offset);
        activeTrackIndex = syncResult.trackIndex;
      } catch (error) {
        updateStatus(`Track switch error: ${error.message}`, true);
      }
    }
  }

  async function bootstrap() {
    if (isBootstrapped) {
      return;
    }

    isBootstrapped = true;

    try {
      const [schedule, qdnStats] = await Promise.all([fetchSchedule(), fetchQdnStats()]);
      scheduleData = schedule;
      qdnBaseStats = qdnStats;

      refreshPlaylistDropdown();
      await refreshQdnPlaylists();
      await refreshPublishedAudio();
      adminPanel.setCurrentTracks(scheduleData.tracks || []);
      updateAdminStats(qdnStats?.totalDuration || 0);

      const firstSync = scheduler.sync(scheduleData);
      render(firstSync);
      updateStatus('Schedule synced. Press Tune In.');

      ui.tuneButton?.addEventListener('click', async () => {
        const latestSync = scheduler.sync(scheduleData);
        await tuneIn(latestSync);
      });

      ui.stopButton?.addEventListener('click', () => {
        audioPlayer.pause();
        isTunedIn = false;
        activeTrackIndex = -1;

        if (ui.tuneButton) {
          ui.tuneButton.disabled = false;
          ui.tuneButton.textContent = 'Tune In';
        }

        if (ui.stopButton) {
          ui.stopButton.disabled = true;
        }

        updateStatus('Playback stopped.');
      });

      tickIntervalId = window.setInterval(() => {
        void tick();
      }, 1000);

    } catch (error) {
      updateStatus(`Bootstrap error: ${error.message}`, true);
    }
  }

  function destroy() {
    if (tickIntervalId) {
      window.clearInterval(tickIntervalId);
      tickIntervalId = null;
    }

    audioPlayer.pause();
  }

  return {
    bootstrap,
    destroy,
    setUserProfile,
  };
}
