/** Optional production QDN extension. The raw transport remains independently testable. */
export type StationAccessExtension = {
  request: (payload: Record<string, unknown>) => Promise<{ handled: boolean; value?: unknown }>;
  authorize: (name: string, address: string) => Promise<boolean>;
  usesDocumentManifest?: (service: string, publisher: string, identifier?: string) => boolean;
};
let extension: StationAccessExtension | null = null;
export function installStationAccess(value: StationAccessExtension | null) {
  extension = value;
}
export function hasStationAccess() {
  return extension !== null;
}
export function usesStationDocumentManifest(
  service: string,
  publisher: string,
  identifier?: string,
) {
  return extension?.usesDocumentManifest?.(service, publisher, identifier) ?? false;
}
export async function stationRequest(
  payload: Record<string, unknown>,
): Promise<{ handled: boolean; value?: unknown }> {
  return extension ? extension.request(payload) : { handled: false };
}
export async function authorizeStationName(name: string, address: string) {
  return extension ? extension.authorize(name, address) : false;
}
