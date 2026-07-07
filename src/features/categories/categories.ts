import * as cheerio from 'cheerio';
import { z } from 'zod';
import { BASE_URL } from '../../constants.js';
import { clientFromOptions } from '../../core/http.js';
import { baseOptionsSchema, parseOptions } from '../../core/options.js';

export const categoriesOptionsSchema = baseOptionsSchema.pick({
  throttle: true,
  requestOptions: true,
});

export type CategoriesOptions = z.input<typeof categoriesOptionsSchema>;

const CATEGORIES_CONTEXT = 'categories';
const STORE_APPS_URL = `${BASE_URL}/store/apps`;
const CATEGORY_URL_PREFIX = '/store/apps/category/';
const APPLICATION_CATEGORY = 'APPLICATION';

function extractCategories(html: string): string[] {
  const $ = cheerio.load(html);
  const ids = $('a')
    .toArray()
    .map((element) => $(element).attr('href'))
    .filter(
      (href): href is string =>
        href !== undefined && href.startsWith(CATEGORY_URL_PREFIX) && !href.includes('?age='),
    )
    .map((href) => href.slice(CATEGORY_URL_PREFIX.length));
  ids.push(APPLICATION_CATEGORY);
  return ids;
}

export async function categories(options?: CategoriesOptions): Promise<string[]> {
  const parsed = parseOptions(categoriesOptionsSchema, options ?? {}, CATEGORIES_CONTEXT);

  const client = clientFromOptions(parsed);
  const html = await client.request({ url: STORE_APPS_URL });

  return z.array(z.string()).parse(extractCategories(html));
}
