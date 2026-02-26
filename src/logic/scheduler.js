export class RadioScheduler {
  sync(scheduleData) {
    const tracks = Array.isArray(scheduleData?.tracks) ? scheduleData.tracks : [];

    if (!tracks.length) {
      return {
        currentTrack: null,
        offset: 0,
        nextTrackIn: 0,
        trackIndex: -1,
      };
    }

    const playlistDuration = tracks.reduce((sum, track) => sum + track.duration, 0);
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - scheduleData.startTime) / 1000));

    const loopedElapsed = playlistDuration > 0 ? elapsedSeconds % playlistDuration : 0;

    let cursor = loopedElapsed;
    let trackIndex = 0;

    for (let i = 0; i < tracks.length; i += 1) {
      if (cursor < tracks[i].duration) {
        trackIndex = i;
        break;
      }
      cursor -= tracks[i].duration;
    }

    const currentTrack = tracks[trackIndex];
    const offset = cursor;
    const nextTrackIn = Math.max(0, currentTrack.duration - offset);

    return {
      currentTrack,
      offset,
      nextTrackIn,
      trackIndex,
    };
  }
}
