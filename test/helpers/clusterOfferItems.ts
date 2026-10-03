import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OFFER_ITEMS_URL = new URL('../fixtures/cluster/offer-items.json', import.meta.url);

export const clusterOfferItems = JSON.parse(
  readFileSync(fileURLToPath(OFFER_ITEMS_URL), 'utf8'),
) as Readonly<Record<string, unknown>>;
