const ICON_ROOT = 'https://icon.example';

export function clusterItem(id: string, priceMicros?: number): unknown[] {
  const item: unknown[] = [];
  item[1] = [null, [[null, null, null, [null, null, `${ICON_ROOT}/${id}`]]]];
  item[2] = `App ${id}`;
  item[4] = [[[`Dev ${id}`]], [null, [null, [null, `Summary of ${id}`]]]];
  item[6] = [[null, null, [null, ['4.5', 4.5]]]];
  if (priceMicros !== undefined) {
    item[7] = [[null, null, null, [null, null, [null, [[priceMicros, 'USD', 'text']]]]]];
  }
  item[9] = [null, null, null, null, [null, null, `/store/apps/details?id=${id}`]];
  item[12] = [id];
  return item;
}

export function clusterBatchResponse(apps: unknown[], nextToken: string | null): string {
  const inner: unknown[] = [];
  inner[0] = apps;
  inner[7] = [null, nextToken];
  const payload = [[inner]];
  const frame = [['wrb.fr', 'qnKhOb', JSON.stringify(payload), null, null, null, 'generic']];
  const json = JSON.stringify(frame);
  return `)]}'\n\n${json.length.toString()}\n${json}`;
}
