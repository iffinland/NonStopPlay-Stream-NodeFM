import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useStation } from '../../features/station';
import {
  loadRegistry,
  resolveMember,
  updateAdmins,
  type Registry,
  type Member,
} from '../../features/collaboration/collaborationService';
import { LoadingState } from '../../components/LoadingState';
import { Spinner } from '../../components/Spinner';
import { PageShell } from '../../components/PageShell';

export default function ManageAdminsPage() {
  const { isOwner } = useStation();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [input, setInput] = useState('');
  const [candidate, setCandidate] = useState<Omit<Member, 'grantId'> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (!isOwner) return;
    let current = true;
    void loadRegistry(true)
      .then((value) => {
        if (current) setRegistry(value);
      })
      .catch((failure) => {
        if (current) setError(String(failure));
      });
    return () => {
      current = false;
    };
  }, [isOwner]);
  if (!isOwner) return <Navigate to="/admin" replace />;
  const resolve = async () => {
    setBusy(true);
    setError(null);
    try {
      const value = await resolveMember(input);
      if (value.address === registry?.owner)
        throw new Error('The station owner already has full access.');
      if (registry?.admins.some((m) => m.address === value.address))
        throw new Error('This account is already an administrator.');
      setCandidate(value);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  const save = async (admins: Omit<Member, 'grantId'>[]) => {
    if (busy || attempted) return;
    setBusy(true);
    setAttempted(true);
    setError(null);
    try {
      const next = await updateAdmins(admins);
      setRegistry(next);
      setCandidate(null);
      setInput('');
      setNotice(
        'Administrator permissions published. Other devices update when QDN has propagated the registry.',
      );
      setAttempted(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setNotice(
        'Check the published access registry before starting another change. Reopen this page to load the network result.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <PageShell title="Manage admins">
      <p>
        Administrators can manage all station content. Only the APP owner can change this list. Each
        administrator publishes using their registered name and pays from their own wallet.
      </p>
      <p>
        Up to 25 administrators. Permission changes use one Hub approval for the complete station
        access document.
      </p>
      {!registry && !error && <LoadingState message="Loading station permissions…" />}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {registry && (
        <fieldset disabled={busy || attempted} className="bulk-import__workspace-fields">
          <p>
            Owner: <strong>{registry.station}</strong> · {registry.owner}
          </p>
          <label className="form-field">
            Qortal name or wallet address
            <input
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setCandidate(null);
              }}
            />
          </label>
          <button
            className="button button--secondary"
            type="button"
            disabled={!input.trim() || registry.admins.length >= 25}
            onClick={() => void resolve()}
          >
            Look up account
          </button>
          {candidate && (
            <div>
              <p>
                <strong>{candidate.name}</strong> · {candidate.address}
              </p>
              <button
                className="button button--primary"
                type="button"
                onClick={() => void save([...registry.admins, candidate])}
              >
                Add administrator
              </button>
            </div>
          )}
          <ul>
            {registry.admins.map((member) => (
              <li key={member.address}>
                <strong>{member.name}</strong> · {member.address}{' '}
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() =>
                    void save(registry.admins.filter((item) => item.address !== member.address))
                  }
                >
                  Remove {member.name}
                </button>
              </li>
            ))}
          </ul>
          {!registry.admins.length && <p>No additional administrators.</p>}
        </fieldset>
      )}
      {busy && (
        <p role="status">
          <Spinner /> Publishing or checking station permissions…
        </p>
      )}
    </PageShell>
  );
}
