// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ManageAdminsPage from './ManageAdminsPage';
import { AdminLayout } from '../../app/AdminLayout';
import {
  loadRegistry,
  resolveMember,
  updateAdmins,
} from '../../features/collaboration/collaborationService';
const context = vi.hoisted(() => ({ isOwner: true }));
vi.mock('../../features/station', () => ({ useStation: () => context }));
vi.mock('../../features/collaboration/collaborationService', () => ({
  loadRegistry: vi.fn(),
  resolveMember: vi.fn(),
  updateAdmins: vi.fn(),
}));
const registry = {
  schemaVersion: 1 as const,
  station: 'Station',
  owner: 'Q-owner',
  epoch: 1,
  admins: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  context.isOwner = true;
  vi.mocked(loadRegistry).mockResolvedValue(registry);
  vi.mocked(resolveMember).mockResolvedValue({ name: 'Editor', address: 'Q-editor' });
});
afterEach(cleanup);
function page() {
  return render(
    <MemoryRouter initialEntries={['/admin/admins']}>
      <Routes>
        <Route path="/admin/admins" element={<ManageAdminsPage />} />
        <Route path="/admin" element={<p>Station dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
it('lets the owner review the resolved wallet before publishing access', async () => {
  vi.mocked(updateAdmins).mockResolvedValue({
    ...registry,
    epoch: 2,
    admins: [{ name: 'Editor', address: 'Q-editor', grantId: 'grant' }],
  });
  page();
  const input = await screen.findByLabelText('Qortal name or wallet address');
  fireEvent.change(input, { target: { value: 'Editor' } });
  fireEvent.click(screen.getByRole('button', { name: 'Look up account' }));
  expect(await screen.findByText(/Q-editor/)).toBeTruthy();
  expect(updateAdmins).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add administrator' }));
  await screen.findByRole('button', { name: 'Remove Editor' });
  expect(updateAdmins).toHaveBeenCalledExactlyOnceWith([{ name: 'Editor', address: 'Q-editor' }]);
});
it('blocks the management route and hides its link from collaborators', async () => {
  context.isOwner = false;
  page();
  await screen.findByText('Station dashboard');
  expect(loadRegistry).not.toHaveBeenCalled();
  cleanup();
  render(
    <MemoryRouter>
      <AdminLayout />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('link', { name: 'Manage admins' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Library' })).toBeTruthy();
});
it('shows progress and prevents a second publication after an unknown outcome', async () => {
  let fail!: (reason: Error) => void;
  vi.mocked(updateAdmins).mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  page();
  fireEvent.change(await screen.findByLabelText('Qortal name or wallet address'), {
    target: { value: 'Editor' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Look up account' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Add administrator' }));
  expect(screen.getByText('Publishing or checking station permissions…')).toBeTruthy();
  fail(new Error('Publication outcome is unknown'));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('unknown'));
  fireEvent.click(screen.getByRole('button', { name: 'Add administrator' }));
  expect(updateAdmins).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
});
