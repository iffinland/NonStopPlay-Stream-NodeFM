/** Publish selected Qortal media, then its verified Track metadata. */

import {
  publishMultipleResources,
  type MultiplePublishResult,
  type PublishMultipleResource,
} from '../../../qortium/qdn';
import { createTrack } from '../../tracks/services/trackService';
import type { QdnResourceRef, Track } from '../../../types/domain';
import { buildTrackCoverPublishResource, type PublishTrackCoverInput } from './coverService';
import { trackPublishResource, upsertTrackLocally } from './libraryService';

export type PublishUploadMediaResourcesInput = {
  publisherName: string;
  audioIdentifier: string;
  audioFile: File;
  title: string;
  cover?: PublishTrackCoverInput;
};

export type PublishUploadMediaResourcesResult = {
  audioPublished: boolean;
  coverPublished: boolean;
  coverRef: QdnResourceRef | undefined;
  response: MultiplePublishResult;
};

function normalizeService(value: string): string {
  return value.trim().toUpperCase();
}

function publishedIdentifier(
  response: MultiplePublishResult,
  service: string,
  identifier: string,
): boolean {
  return (
    response.accepted &&
    response.published.some(
      (entry) =>
        normalizeService(entry.resource.service) === normalizeService(service) &&
        entry.resource.identifier === identifier,
    )
  );
}

export function buildUploadAudioPublishResource(input: {
  publisherName: string;
  audioIdentifier: string;
  audioFile: File;
  title: string;
}): PublishMultipleResource {
  if (!input.publisherName.trim()) {
    throw new Error('A registered Qortal name is required to publish audio.');
  }

  if (!input.audioIdentifier.trim()) {
    throw new Error('An audio identifier is required to publish audio.');
  }

  if (!input.audioFile || input.audioFile.size <= 0)
    throw new Error('Select an audio file before publishing.');

  return {
    service: 'AUDIO',
    name: input.publisherName.trim(),
    identifier: input.audioIdentifier.trim(),
    file: input.audioFile,
    fileName: input.audioFile.name,
    title: input.title.trim(),
  };
}

/**
 * Publish the selected AUDIO source and optional cover image through one
 * `PUBLISH_MULTIPLE_QDN_RESOURCES` approval.
 */
export async function publishUploadMediaResources(
  input: PublishUploadMediaResourcesInput,
): Promise<PublishUploadMediaResourcesResult> {
  const audioResource = buildUploadAudioPublishResource({
    publisherName: input.publisherName,
    audioIdentifier: input.audioIdentifier,
    audioFile: input.audioFile,
    title: input.title,
  });

  const cover = input.cover
    ? buildTrackCoverPublishResource({
        publisherName: input.cover.publisherName,
        title: input.cover.title,
        file: input.cover.file,
        bytesBase64: input.cover.bytesBase64,
      })
    : undefined;

  const resources = cover ? [audioResource, cover.resource] : [audioResource];
  const response = await publishMultipleResources(resources);

  const audioPublished = publishedIdentifier(response, 'AUDIO', audioResource.identifier ?? '');
  const coverPublished = cover
    ? publishedIdentifier(response, 'IMAGE', cover.ref.identifier ?? '')
    : true;

  return {
    audioPublished,
    coverPublished,
    coverRef: cover?.ref,
    response,
  };
}

/**
 * Publish the complete Track metadata resource after AUDIO (and cover, if
 * selected) have been published and duration has been resolved.
 */
export async function publishUploadTrackMetadata(
  track: Track,
  publisherName: string,
): Promise<void> {
  const resource = trackPublishResource(track, publisherName);
  const response = await publishMultipleResources([resource]);
  const published = publishedIdentifier(response, 'JSON', resource.identifier ?? '');

  if (!published) {
    const failure = response.failures.find(
      (entry) => entry.resource.identifier === resource.identifier,
    );
    throw new Error(
      `Failed to publish track metadata: ${
        failure?.error ?? 'QDN batch publication returned no result for the track.'
      }`,
    );
  }
  upsertTrackLocally(track);
}

/** Prepare audio, cover and Track metadata before the only signed request. */
export async function publishUploadTrackBundle(
  input: PublishUploadMediaResourcesInput,
  details: Omit<import('../../tracks/services/trackService').CreateTrackInput, 'audio' | 'cover'>,
): Promise<Track> {
  const audio = buildUploadAudioPublishResource(input);
  const cover = input.cover ? buildTrackCoverPublishResource(input.cover) : undefined;
  const track = createTrack({
    ...details,
    audio: { service: 'AUDIO', name: input.publisherName, identifier: input.audioIdentifier },
    cover: cover?.ref,
  });
  const resources = [
    audio,
    ...(cover ? [cover.resource] : []),
    trackPublishResource(track, input.publisherName),
  ];
  const result = await publishMultipleResources(resources);
  if (
    resources.some(
      (r) =>
        !result.published.some(
          (entry) =>
            entry.resource.name === r.name &&
            entry.resource.service === r.service &&
            entry.resource.identifier === r.identifier &&
            !!entry.transactionSignature,
        ),
    )
  )
    throw new Error(
      `Track publication was not fully confirmed. ${result.failures[0]?.error ?? 'Check saved resources before publishing again.'}`,
    );
  upsertTrackLocally(track);
  return track;
}
