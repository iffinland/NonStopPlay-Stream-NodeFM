export const RADIO_SCHEDULE = {
  startTime: Date.now() - 150000,
  tracks: [
    {
      title: 'Quantum Beats',
      artist: 'NodeFM Resident',
      duration: 300,
      url: '/arbitrary/AUDIO/nodefm/nodefm-demo-track-1',
    },
    {
      title: 'Block Lattice',
      artist: 'Satoshi',
      duration: 240,
      url: '/arbitrary/AUDIO/nodefm/nodefm-demo-track-2',
    },
    {
      title: 'Mesh Frequency',
      artist: 'QNode Collective',
      duration: 210,
      url: '/arbitrary/AUDIO/nodefm/nodefm-demo-track-3',
    },
  ],
};

export const MOCK_USER_PROFILE = {
  address: 'QXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  name: 'Guest Listener',
  avatarUrl: '',
};

export const MOCK_QDN_STATS = {
  totalSongsQdn: 128,
  totalPlaylists: 6,
  totalDuration: 29240,
};
