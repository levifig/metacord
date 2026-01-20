export interface WidgetCacheEntry {
  instantInvite: string | null;
  presenceCount: number | null;
  lastCached: string | null;
}

export interface UserDataStore {
  version: number;
  favorites: string[];
  nicknames: Record<string, string>;
  notes: Record<string, string>;
  widgetCache: Record<string, WidgetCacheEntry>;
}

interface StorageOptions {
  storageKey?: string;
}

const STORAGE_KEY = 'discord_manager_user_data';

export const createDefaultUserData = (): UserDataStore => ({
  version: 1,
  favorites: [],
  nicknames: {},
  notes: {},
  widgetCache: {},
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const toStringRecord = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<Record<string, string>>((acc, [key, entry]) => {
    if (typeof entry === 'string') {
      acc[key] = entry;
    }
    return acc;
  }, {});
};

const toWidgetCache = (value: unknown): Record<string, WidgetCacheEntry> => {
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<Record<string, WidgetCacheEntry>>((acc, [key, entry]) => {
    if (!isRecord(entry)) {
      return acc;
    }
    const instantInvite = typeof entry.instantInvite === 'string' ? entry.instantInvite : null;
    const presenceCount = typeof entry.presenceCount === 'number' ? entry.presenceCount : null;
    const lastCached = typeof entry.lastCached === 'string' ? entry.lastCached : null;
    acc[key] = { instantInvite, presenceCount, lastCached };
    return acc;
  }, {});
};

const resolveStorageKey = (options?: StorageOptions): string => options?.storageKey ?? STORAGE_KEY;

export const loadUserData = (options?: StorageOptions): UserDataStore => {
  try {
    const stored = localStorage.getItem(resolveStorageKey(options));
    if (!stored) {
      return createDefaultUserData();
    }
    const parsed: unknown = JSON.parse(stored);
    if (!isRecord(parsed)) {
      return createDefaultUserData();
    }
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      favorites: toStringArray(parsed.favorites),
      nicknames: toStringRecord(parsed.nicknames),
      notes: toStringRecord(parsed.notes),
      widgetCache: toWidgetCache(parsed.widgetCache),
    };
  } catch (error) {
    console.error('Failed to load user data', error);
    return createDefaultUserData();
  }
};

export const saveUserData = (data: UserDataStore, options?: StorageOptions): void => {
  localStorage.setItem(resolveStorageKey(options), JSON.stringify(data));
};

export const toggleFavorite = (
  data: UserDataStore,
  guildId: string,
  options?: StorageOptions,
): UserDataStore => {
  const isFavorite = data.favorites.includes(guildId);
  const favorites = isFavorite
    ? data.favorites.filter((id) => id !== guildId)
    : [...data.favorites, guildId];
  const next = { ...data, favorites };
  saveUserData(next, options);
  return next;
};

export const updateNickname = (
  data: UserDataStore,
  guildId: string,
  nickname: string,
  options?: StorageOptions,
): UserDataStore => {
  const trimmed = nickname.trim();
  const nextNicknames = { ...data.nicknames };
  if (trimmed.length > 0) {
    nextNicknames[guildId] = trimmed;
  } else {
    delete nextNicknames[guildId];
  }
  const next = { ...data, nicknames: nextNicknames };
  saveUserData(next, options);
  return next;
};

export const updateNotes = (
  data: UserDataStore,
  guildId: string,
  notes: string,
  options?: StorageOptions,
): UserDataStore => {
  const trimmed = notes.trim();
  const nextNotes = { ...data.notes };
  if (trimmed.length > 0) {
    nextNotes[guildId] = trimmed;
  } else {
    delete nextNotes[guildId];
  }
  const next = { ...data, notes: nextNotes };
  saveUserData(next, options);
  return next;
};

export const updateWidgetCache = (
  data: UserDataStore,
  guildId: string,
  entry: WidgetCacheEntry,
  options?: StorageOptions,
): UserDataStore => {
  const next = {
    ...data,
    widgetCache: {
      ...data.widgetCache,
      [guildId]: entry,
    },
  };
  saveUserData(next, options);
  return next;
};

export const clearWidgetCache = (data: UserDataStore, options?: StorageOptions): UserDataStore => {
  const next = { ...data, widgetCache: {} };
  saveUserData(next, options);
  return next;
};

export const exportUserData = (data: UserDataStore): string => {
  return JSON.stringify(data, null, 2);
};

const isValidUserData = (value: unknown): value is UserDataStore => {
  if (!isRecord(value)) return false;
  if (typeof value.version !== 'number') return false;
  if (!Array.isArray(value.favorites)) return false;
  if (!isRecord(value.nicknames)) return false;
  if (!isRecord(value.notes)) return false;
  if (!isRecord(value.widgetCache)) return false;
  return true;
};

export const importUserData = (raw: unknown, options?: StorageOptions): UserDataStore => {
  if (!isValidUserData(raw)) {
    throw new Error('Invalid user data format');
  }

  const sanitized: UserDataStore = {
    version: raw.version,
    favorites: toStringArray(raw.favorites),
    nicknames: toStringRecord(raw.nicknames),
    notes: toStringRecord(raw.notes),
    widgetCache: toWidgetCache(raw.widgetCache),
  };
  saveUserData(sanitized, options);
  return sanitized;
};
