export const MALFORMED_APP_IDS: readonly string[] = [
  ' com.whatsapp',
  'com.whatsapp ',
  'com.whatsapp&hl=de',
  'com.whatsapp#frag',
  'com.whatsapp/../com.spotify.music',
  'com.żółw.app',
  'com',
  'a',
  '',
  'x'.repeat(300),
];
