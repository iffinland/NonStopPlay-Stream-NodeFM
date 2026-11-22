import { describe, expect, it } from 'vitest';
import { qdnAudioDetails, parseManualAudioDuration } from './qdnAudioDetails';
describe('QDN metadata hints', () => {
  it('reads the existing title/author description convention without inventing missing fields', () => {
    expect(
      qdnAudioDetails({
        name: 'Publisher',
        service: 'AUDIO',
        metadata: {
          description: 'title=Ameno (Euro dance flor mix2024);author=Era;album=Mix',
          tags: ['dance'],
        },
      }),
    ).toMatchObject({
      title: 'Ameno (Euro dance flor mix2024)',
      artist: 'Era',
      album: 'Mix',
      tags: 'dance',
    });
    expect(
      qdnAudioDetails({
        name: 'Publisher',
        service: 'AUDIO',
        metadata: { title: 'Song', description: 'Free text' },
      }),
    ).toMatchObject({ title: 'Song', artist: '', description: 'Free text' });
  });
  it.each([
    ['3:45', 225000],
    ['1:02:03', 3723000],
    ['0:00.125', 125],
    ['123:45', 7425000],
  ])('parses %s accurately', (value, ms) => {
    expect(parseManualAudioDuration(value)).toBe(ms);
  });
  it.each(['', '0:00', '3:99', '1:60:00', 'NaN', '-1:30', '3', '3.5', '1:2', '1:00:99'])(
    'rejects ambiguous or invalid duration %s',
    (value) => {
      expect(parseManualAudioDuration(value)).toBeNull();
    },
  );
});
