import { PageShell } from '../../components/PageShell';
import { useStation } from '../../features/station';

export default function MessagesPage() {
  const { station, loading } = useStation();
  return (
    <PageShell title="Messages">
      <div className="admin-messages">
        {loading ? (
          <p>Loading station information…</p>
        ) : (
          <>
            <p>Listener messages are delivered to the station owner's private Qortal chat.</p>
            <p>
              Open the Chat panel in Qortal Hub while signed into the owner's account to read and
              reply.
            </p>
            {station && (
              <p>
                Recipient: <strong>{station.ownerName || station.publisherName}</strong> ·{' '}
                {station.ownerAddress}
              </p>
            )}
            <p>Station administrator access does not share the owner's private chat or wallet.</p>
            {station?.messagingEnabled === false && (
              <p className="form-error">Station messaging is currently disabled.</p>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
