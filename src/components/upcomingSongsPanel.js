import { formatTime } from '../utils/time.js';

export class UpcomingSongsPanel {
  constructor(listElement, emptyElement) {
    this.listElement = listElement;
    this.emptyElement = emptyElement;
  }

  render(tracks) {
    if (!this.listElement || !this.emptyElement) {
      return;
    }

    if (!tracks.length) {
      this.listElement.replaceChildren();
      this.emptyElement.textContent = 'No upcoming tracks available.';
      this.emptyElement.hidden = false;
      return;
    }

    this.emptyElement.hidden = true;
    const items = tracks.map((track) => {
      const item = document.createElement('li');
      item.className = 'upcoming-item';

      const order = document.createElement('div');
      order.className = 'upcoming-order';
      order.textContent = `#${track.queuePosition}`;

      const meta = document.createElement('div');
      meta.className = 'upcoming-meta';

      const title = document.createElement('p');
      title.className = 'upcoming-title';
      title.textContent = track.title;

      const artist = document.createElement('p');
      artist.className = 'upcoming-artist';
      artist.textContent = track.artist;

      const duration = document.createElement('div');
      duration.className = 'upcoming-duration';
      duration.textContent = formatTime(track.duration);

      meta.append(title, artist);
      item.append(order, meta, duration);

      return item;
    });

    this.listElement.replaceChildren(...items);
  }
}
