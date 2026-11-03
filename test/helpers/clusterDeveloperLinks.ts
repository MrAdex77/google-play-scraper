import { BASE_URL } from '../../src/constants.ts';
import { parseBatchResponse } from '../../src/core/batchexecute.ts';
import { CLUSTER_RPC_ID } from '../../src/core/pagination.ts';
import { getPath, type Path } from '../../src/core/path.ts';

const APP_ID_PATH = [12, 0];
const DEVELOPER_LINK_PATH = [4, 0, 0, 1, 4, 2];

const linkedDeveloperId = (item: unknown): [unknown, string | undefined] => {
  const link = getPath(item, DEVELOPER_LINK_PATH);
  const developerId =
    typeof link === 'string'
      ? (new URL(link, BASE_URL).searchParams.get('id') ?? undefined)
      : undefined;
  return [getPath(item, APP_ID_PATH), developerId];
};

export function clusterDeveloperLinks(
  batch: string,
  appsPath: Path,
): [unknown, string | undefined][] {
  const apps = getPath(parseBatchResponse(batch, CLUSTER_RPC_ID), appsPath);
  if (!Array.isArray(apps)) {
    throw new Error('the recorded continuation carries no apps array');
  }
  return apps.map(linkedDeveloperId);
}
