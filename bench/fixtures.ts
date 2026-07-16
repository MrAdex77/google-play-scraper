import { readFileSync } from 'node:fs';

export const APP_FIXTURES = {
  'translate.html': 'com.google.android.apps.translate',
  'minecraft.html': 'com.mojang.minecraftpe',
  'whereami.html': 'com.adex77.WhereAmI',
} as const;

export type AppFixtureName = keyof typeof APP_FIXTURES;

export function loadAppFixture(name: AppFixtureName): string {
  return readFileSync(new URL(`../test/fixtures/app/${name}`, import.meta.url), 'utf8');
}
