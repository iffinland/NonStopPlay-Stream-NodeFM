export const ADMIN_ADDRESS = 'QTRKB2qCSANjYj5JbhybkvQyPmSC24PZZZ';

export function isAdminAddress(address) {
  if (!address || typeof address !== 'string') {
    return false;
  }

  return address.trim() === ADMIN_ADDRESS;
}
