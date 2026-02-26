export function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const mins = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const secs = String(safeSeconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}
