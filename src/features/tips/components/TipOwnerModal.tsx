import { Spinner } from '../../../components/Spinner';
/* ============================================================
 * NodeFM Station — Tip Owner Modal
 *
 * Financially sensitive. The modal only reports success after
 * Qortal Hub returns a matching signed payment. It never retries
 * automatically and never converts a failed transaction into a
 * locally successful state.
 * ============================================================ */

import { useEffect, useState } from 'react';
import { useSocialAction } from '../../../hooks/useSocialAction';
import { Modal } from '../../../components/Modal';
import { useAuth } from '../../../app/providers/authContext';
import type { Station } from '../../../types/domain';
import { sendStationTip } from '../services/tipService';

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

export function TipOwnerModal({ station, onClose }: Props) {
  const { auth } = useAuth();
  const userAddress = auth.status === 'authenticated' ? auth.address : null;
  const [amount, setAmount] = useState('');
  const { sending, error, uncertain, run } = useSocialAction(userAddress, onClose);
  useEffect(() => {
    setAmount('');
  }, [userAddress]);

  const recipientLabel = station.ownerName ?? shortAddress(station.ownerAddress);
  const canTip = auth.status === 'authenticated' && station.tipsEnabled;

  const handleTip = () =>
    run(async () => {
      if (!userAddress) throw new Error('Connect a Qortal account first.');
      return sendStationTip({
        recipient: station.ownerAddress,
        amount,
        tipsEnabled: station.tipsEnabled,
      });
    });

  return (
    <Modal title="Tip the Station Owner" onClose={onClose} busy={sending}>
      <p className="social-modal__recipient">
        To: <strong>{recipientLabel}</strong>
      </p>

      {!userAddress && <p className="form-error">Connect a Qortal account in Hub to send a tip.</p>}

      {userAddress && !station.tipsEnabled && (
        <p className="form-error">Station tips/donations are currently disabled by the owner.</p>
      )}

      <label className="form-field">
        Amount (QORT)
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="1.00"
          disabled={!canTip || sending || uncertain}
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
          onClick={handleTip}
          disabled={sending || uncertain || !amount.trim() || !canTip}
        >
          {sending ? (
            <>
              <Spinner /> Waiting for approval
            </>
          ) : (
            'Send Tip'
          )}
        </button>
      </div>
    </Modal>
  );
}
