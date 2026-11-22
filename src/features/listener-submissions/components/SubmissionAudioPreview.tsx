import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../../components/Modal';
import { LoadingState } from '../../../components/LoadingState';
import { Spinner } from '../../../components/Spinner';
import { ensureQdnResourceReady, getQdnResourceUrl } from '../../../qortium/qdn';
import { getAudioEngine } from '../../../audio/AudioEngine';
import type { ListenerTrackSubmission } from '../../../types/domain';

export function SubmissionAudioPreview({
  submission,
  onClose,
}: {
  submission: ListenerTrackSubmission;
  onClose: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [revision, setRevision] = useState(0);
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [buffering, setBuffering] = useState(false);
  useEffect(() => {
    let current = true;
    const audio = audioRef.current;
    setUrl(undefined);
    setError(undefined);
    setBuffering(false);
    void (async () => {
      try {
        // Use the complete AUDIO coordinate, including its non-default identifier.
        await ensureQdnResourceReady(submission.audio);
        if (!current) return;
        const next = await getQdnResourceUrl(submission.audio);
        if (current) setUrl(next);
      } catch (failure) {
        if (current)
          setError(failure instanceof Error ? failure.message : 'Audio preview is unavailable.');
      }
    })();
    return () => {
      current = false;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
    };
  }, [submission, revision]);
  return (
    <Modal title="Preview submission" onClose={onClose}>
      <p>
        <strong>{submission.title}</strong>
        {submission.artist ? ` — ${submission.artist}` : ''}
      </p>
      {!url && !error && <LoadingState message="Preparing audio preview…" />}
      {url && buffering && !error && (
        <p role="status">
          <Spinner /> Loading audio
        </p>
      )}
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={url}
        hidden={!url || !!error}
        aria-label="Submission audio preview"
        onPlay={() => getAudioEngine().pause()}
        onLoadStart={() => setBuffering(true)}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onPlaying={() => setBuffering(false)}
        onError={() => {
          if (url) {
            setBuffering(false);
            setError(
              'This audio could not be played. It may still be downloading or use an unsupported format.',
            );
          }
        }}
        style={{ width: '100%' }}
      />
      {error && (
        <>
          <p role="alert" className="form-error">
            {error}
          </p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Reload audio
          </button>
        </>
      )}
      <div className="form-actions">
        <button className="button button--primary" type="button" onClick={onClose}>
          Close preview
        </button>
      </div>
    </Modal>
  );
}
