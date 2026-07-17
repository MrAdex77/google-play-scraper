import * as z from 'zod/mini';
import { category } from '../../constants.js';
import { baseOptionsSchema, parseOptions } from '../../core/options.js';

export const categoriesOptionsSchema = z.pick(baseOptionsSchema, {
  throttle: true,
  requestOptions: true,
});

export type CategoriesOptions = z.input<typeof categoriesOptionsSchema>;

const CATEGORIES_CONTEXT = 'categories';
const categoryListSchema = z.array(z.string()).check(z.minLength(1));
const CATEGORY_IDS: readonly string[] = Object.values(category);

export function categories(options?: CategoriesOptions): Promise<string[]> {
  return Promise.resolve().then(() => {
    parseOptions(categoriesOptionsSchema, options ?? {}, CATEGORIES_CONTEXT);
    return categoryListSchema.parse([...CATEGORY_IDS]);
  });
}
