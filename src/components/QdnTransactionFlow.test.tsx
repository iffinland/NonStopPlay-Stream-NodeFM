// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QdnTransactionFlow } from './QdnTransactionFlow';
import {
  createQdnTransactionState,
  markQdnTransactionChunkActive,
  type QdnTransactionPhase,
} from './qdnTransactionFlow';
afterEach(cleanup);
describe('transaction progress without signed retries', () => {
  it('renders a spinning indicator while active and does not let the busy dialog restart or close the request', () => {
    const close = vi.fn();
    const state = markQdnTransactionChunkActive(
      createQdnTransactionState([{ id: 'accept', label: 'Accept listener upload' }], {
        retryable: true,
      }),
      'accept',
    );
    const view = render(
      <QdnTransactionFlow title="Accept submission" state={state} onClose={close} />,
    );
    expect(view.baseElement.querySelector('.progress-spinner')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).not.toHaveBeenCalled();
  });
  it.each(['success', 'partial', 'failed'] as QdnTransactionPhase[])(
    'offers close and no repeat transaction for %s',
    (phase) => {
      const close = vi.fn();
      const state = {
        ...createQdnTransactionState([{ id: 'write', label: 'Publish' }], { retryable: true }),
        phase,
      };
      render(<QdnTransactionFlow title="Publish" state={state} onClose={close} />);
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).slice(-1)[0]);
      expect(close).toHaveBeenCalledTimes(1);
    },
  );
});
