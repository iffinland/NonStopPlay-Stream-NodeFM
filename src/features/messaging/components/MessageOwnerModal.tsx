import { Spinner } from '../../../components/Spinner';
/* ============================================================
 * NodeFM Station — Message Owner Modal
 *
 * Direct-message action to the station owner. The modal stays
 * open on remote failure and closes only on confirmed success
 * or the explicit X/Close control.
 * ============================================================ */

import { useEffect, useState } from 'react';
import { useSocialAction } from '../../../hooks/useSocialAction';
import { Modal } from '../../../components/Modal';
import { useAuth } from '../../../app/providers/authContext';
import type { Station } from '../../../types/domain';
import { sendStationMessage } from '../services/messagingService';

type Props = {
  station: Station;
  onClose: () => void;
};

function shortAddress(address: string): string {
  if (address.length <= 14) {
    return address;
  }

  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function MessageOwnerModal({ station, onClose }: Props) {
  const { auth } = useAuth();
  const userAddress = auth.status === 'authenticated' ? auth.address : null;
  const [message, setMessage] = useState('');
  const { sending, error, uncertain, run } = useSocialAction(userAddress, onClose);
  useEffect(() => {
    setMessage('');
  }, [userAddress]);

  const recipientLabel = station.ownerName ?? shortAddress(station.ownerAddress);
  const canSend = auth.status === 'authenticated' && station.messagingEnabled;

  const handleSend = () =>
    run(async () => {
      if (!userAddress) throw new Error('Connect a Qortal account first.');
      return sendStationMessage({
        recipientAddress: station.ownerAddress,
        message,
        messagingEnabled: station.messagingEnabled,
      });
    });

  return (
    <Modal title="Message the Station Owner" onClose={onClose} busy={sending}>
      <p className="social-modal__recipient">
        To: <strong>{recipientLabel}</strong>
      </p>

      {!userAddress && (
        <p className="form-error">Connect a Qortal account in Hub to send a message.</p>
      )}

      {userAddress && !station.messagingEnabled && (
        <p className="form-error">Station messaging is currently disabled by the owner.</p>
      )}

      <label className="form-field">
        Message
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={6}
          maxLength={4000}
          placeholder="Write a message to the station owner…"
          disabled={!canSend || sending || uncertain}
        />
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button
          className="button button--secondary"
          type="button"
          onClick={onClose}
          disabled={sending}
        >
          Close
        </button>
        <button
          className="button button--primary"
          type="button"
          onClick={handleSend}
          disabled={sending || uncertain || !message.trim() || !canSend}
        >
          {sending ? (
            <>
              <Spinner /> Sending
            </>
          ) : (
            'Send Message'
          )}
        </button>
      </div>
    </Modal>
  );
}
