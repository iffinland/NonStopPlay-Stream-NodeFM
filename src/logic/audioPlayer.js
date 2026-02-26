export class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
  }

  async playTrack(url, offset = 0) {
    if (!url) {
      throw new Error('Track URL is missing.');
    }

    const shouldLoadNewTrack = this.audio.src !== url;

    if (shouldLoadNewTrack) {
      this.audio.src = url;
      this.audio.load();
    }

    try {
      this.audio.currentTime = Math.max(0, offset);
      await this.audio.play();
    } catch (error) {
      const blocked =
        error?.name === 'NotAllowedError' ||
        /user gesture|autoplay/i.test(error?.message || '');

      if (blocked) {
        const autoplayError = new Error('AutoplayBlocked');
        autoplayError.code = 'AUTOPLAY_BLOCKED';
        throw autoplayError;
      }

      throw error;
    }
  }

  pause() {
    this.audio.pause();
  }

  onEnded(handler) {
    this.audio.onended = handler;
  }
}
