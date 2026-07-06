export const BASE_URL = 'https://play.google.com';

export const clusters = {
  new: 'new',
  top: 'top',
} as const;

export type Cluster = (typeof clusters)[keyof typeof clusters];

export const category = {
  APPLICATION: 'APPLICATION',
  ANDROID_WEAR: 'ANDROID_WEAR',
  ART_AND_DESIGN: 'ART_AND_DESIGN',
  AUTO_AND_VEHICLES: 'AUTO_AND_VEHICLES',
  BEAUTY: 'BEAUTY',
  BOOKS_AND_REFERENCE: 'BOOKS_AND_REFERENCE',
  BUSINESS: 'BUSINESS',
  COMICS: 'COMICS',
  COMMUNICATION: 'COMMUNICATION',
  DATING: 'DATING',
  EDUCATION: 'EDUCATION',
  ENTERTAINMENT: 'ENTERTAINMENT',
  EVENTS: 'EVENTS',
  FINANCE: 'FINANCE',
  FOOD_AND_DRINK: 'FOOD_AND_DRINK',
  HEALTH_AND_FITNESS: 'HEALTH_AND_FITNESS',
  HOUSE_AND_HOME: 'HOUSE_AND_HOME',
  LIBRARIES_AND_DEMO: 'LIBRARIES_AND_DEMO',
  LIFESTYLE: 'LIFESTYLE',
  MAPS_AND_NAVIGATION: 'MAPS_AND_NAVIGATION',
  MEDICAL: 'MEDICAL',
  MUSIC_AND_AUDIO: 'MUSIC_AND_AUDIO',
  NEWS_AND_MAGAZINES: 'NEWS_AND_MAGAZINES',
  PARENTING: 'PARENTING',
  PERSONALIZATION: 'PERSONALIZATION',
  PHOTOGRAPHY: 'PHOTOGRAPHY',
  PRODUCTIVITY: 'PRODUCTIVITY',
  SHOPPING: 'SHOPPING',
  SOCIAL: 'SOCIAL',
  SPORTS: 'SPORTS',
  TOOLS: 'TOOLS',
  TRAVEL_AND_LOCAL: 'TRAVEL_AND_LOCAL',
  VIDEO_PLAYERS: 'VIDEO_PLAYERS',
  WATCH_FACE: 'WATCH_FACE',
  WEATHER: 'WEATHER',
  GAME: 'GAME',
  GAME_ACTION: 'GAME_ACTION',
  GAME_ADVENTURE: 'GAME_ADVENTURE',
  GAME_ARCADE: 'GAME_ARCADE',
  GAME_BOARD: 'GAME_BOARD',
  GAME_CARD: 'GAME_CARD',
  GAME_CASINO: 'GAME_CASINO',
  GAME_CASUAL: 'GAME_CASUAL',
  GAME_EDUCATIONAL: 'GAME_EDUCATIONAL',
  GAME_MUSIC: 'GAME_MUSIC',
  GAME_PUZZLE: 'GAME_PUZZLE',
  GAME_RACING: 'GAME_RACING',
  GAME_ROLE_PLAYING: 'GAME_ROLE_PLAYING',
  GAME_SIMULATION: 'GAME_SIMULATION',
  GAME_SPORTS: 'GAME_SPORTS',
  GAME_STRATEGY: 'GAME_STRATEGY',
  GAME_TRIVIA: 'GAME_TRIVIA',
  GAME_WORD: 'GAME_WORD',
  FAMILY: 'FAMILY',
} as const;

export type Category = (typeof category)[keyof typeof category];

export const collection = {
  TOP_FREE: 'TOP_FREE',
  TOP_PAID: 'TOP_PAID',
  GROSSING: 'GROSSING',
} as const;

export type Collection = (typeof collection)[keyof typeof collection];

export const sort = {
  NEWEST: 2,
  RATING: 3,
  HELPFULNESS: 1,
} as const;

export type Sort = (typeof sort)[keyof typeof sort];

export const age = {
  FIVE_UNDER: 'AGE_RANGE1',
  SIX_EIGHT: 'AGE_RANGE2',
  NINE_UP: 'AGE_RANGE3',
} as const;

export type Age = (typeof age)[keyof typeof age];

export const permission = {
  COMMON: 0,
  OTHER: 1,
} as const;

export type Permission = (typeof permission)[keyof typeof permission];

Object.freeze(clusters);
Object.freeze(category);
Object.freeze(collection);
Object.freeze(sort);
Object.freeze(age);
Object.freeze(permission);
