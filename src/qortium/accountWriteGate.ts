/** Qortal owns account access, signing and approval dialogs. Never handle passwords. */
import { sendBridgeRequest } from './bridge';
import { getResolvedAccountAddress } from './auth';
import { authorizeStationName } from './stationAccess';

export type AccountWriteTicket = { address: string; name?: string };
export type AccountWriteReadiness = { status: 'ready'; address: string } | { status: 'no-account' };
export class QortalAccountRequiredError extends Error {
  constructor() {
    super('Connect a Qortal account before publishing.');
    this.name = 'QortalAccountRequiredError';
  }
}
export { QortalAccountRequiredError as QortiumAccountRequiredError };
export function resetAccountWriteGateCache(): void {
  /* Signed writes always re-read Hub. */
}
export async function getAccountWriteReadiness(): Promise<AccountWriteReadiness> {
  const value = await sendBridgeRequest<unknown>({ action: 'GET_USER_ACCOUNT' });
  const address =
    value && typeof value === 'object' && 'address' in value && typeof value.address === 'string'
      ? value.address.trim()
      : '';
  return address ? { status: 'ready', address } : { status: 'no-account' };
}
export async function requireAccountWrite(
  _action = 'PUBLISH_QDN_RESOURCE',
  expectedAddress?: string,
): Promise<AccountWriteTicket> {
  void _action;
  const expected = expectedAddress ?? getResolvedAccountAddress();
  const state = await getAccountWriteReadiness();
  if (state.status !== 'ready') throw new QortalAccountRequiredError();
  if (expected && expected !== state.address)
    throw new Error('The Hub account changed. Reconnect the current account before publishing.');
  return { address: state.address };
}
export async function assertPublisherOwner(
  name: string,
  ticket: AccountWriteTicket,
): Promise<void> {
  if (await authorizeStationName(name, ticket.address)) return;
  const value = await sendBridgeRequest<unknown>({ action: 'GET_NAME_DATA', name });
  if (
    !value ||
    typeof value !== 'object' ||
    !('owner' in value) ||
    value.owner !== ticket.address
  ) {
    throw new Error(`The current Qortal account does not own the publishing name ${name}.`);
  }
}
export async function runAccountWrite<T>(
  action: string,
  operation: (ticket: AccountWriteTicket) => Promise<T>,
): Promise<T> {
  return operation(await requireAccountWrite(action));
}
