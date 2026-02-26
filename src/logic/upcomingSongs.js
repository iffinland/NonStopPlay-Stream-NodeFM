export function getUpcomingTracks(tracks, currentTrackIndex, maxItems = 3) {
  if (!Array.isArray(tracks) || tracks.length < 2 || currentTrackIndex < 0) {
    return [];
  }

  const limit = Math.max(0, Math.min(maxItems, tracks.length - 1));
  const upcoming = [];

  for (let step = 1; step <= limit; step += 1) {
    const nextIndex = (currentTrackIndex + step) % tracks.length;
    upcoming.push({
      queuePosition: step,
      ...tracks[nextIndex],
    });
  }

  return upcoming;
}
