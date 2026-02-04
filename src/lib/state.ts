import { loadUserData, type UserDataStore } from './storage';

export type FilterKey = 'all' | 'owned' | 'partner' | 'verified' | 'boosted' | 'discoverable';
export type SectionKey = 'favorites' | 'owned' | 'public' | 'private';
export type SortKey = 'name-asc' | 'name-desc' | 'online-desc';

export const COLLAPSED_SECTIONS_KEY = 'discord_manager_collapsed_sections';
export const SORT_PREFERENCE_KEY = 'discord_manager_sort_preference';
export const DEMO_GUILDS_KEY = 'discord_manager_demo_guilds';
export const DEMO_STORAGE_KEY = 'discord_manager_demo_user_data';
export const FETCH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export const filterTooltipCopy: Partial<Record<FilterKey, string>> = {
  owned: 'Servers you administer',
  partner: 'Discord Partner Program',
  verified: 'Officially verified server',
  boosted: 'Nitro boost enabled',
  discoverable: 'Listed in Server Discovery',
};

export interface AppState {
  me: string | null;
  guilds: import('./api').ApiGuild[];
  userData: UserDataStore;
  activeFilters: Set<FilterKey>;
  search: string;
  sort: SortKey;
}

export interface SectionElements {
  section: HTMLElement;
  list: HTMLElement;
  count: HTMLElement;
  content: HTMLElement;
  header: HTMLButtonElement;
}

export interface DemoGuildEntry {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  owner: boolean;
  features: string[];
}

export const getElement = <T extends HTMLElement>(selector: string): T => {
  const element = selector.startsWith('[') || selector.startsWith('.')
    ? document.querySelector<T>(selector)
    : document.getElementById(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element as T;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const loadCollapsedSections = (): Set<SectionKey> => {
  try {
    const stored = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
    if (!stored) return new Set();
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is SectionKey =>
      typeof item === 'string' && ['favorites', 'owned', 'public', 'private'].includes(item)
    ));
  } catch {
    return new Set();
  }
};

export const saveCollapsedSections = (collapsed: Set<SectionKey>): void => {
  localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...collapsed]));
};

const VALID_SORT_KEYS: SortKey[] = ['name-asc', 'name-desc', 'online-desc'];

export const loadSortPreference = (): SortKey => {
  try {
    const stored = localStorage.getItem(SORT_PREFERENCE_KEY);
    if (stored && VALID_SORT_KEYS.includes(stored as SortKey)) {
      return stored as SortKey;
    }
  } catch {
    // ignore
  }
  return 'name-asc';
};

export const saveSortPreference = (sort: SortKey): void => {
  localStorage.setItem(SORT_PREFERENCE_KEY, sort);
};

export const collapsedSections = loadCollapsedSections();

export const isDemoMode = new URLSearchParams(window.location.search).get('demo') === '1';
export const storageOptions = isDemoMode ? { storageKey: DEMO_STORAGE_KEY } : undefined;

export const state: AppState = {
  me: null,
  guilds: [],
  userData: loadUserData(storageOptions),
  activeFilters: new Set<FilterKey>(),
  search: '',
  sort: loadSortPreference(),
};

let _sections: Record<string, SectionElements> | null = null;

export const getSections = (): Record<string, SectionElements> => {
  if (!_sections) {
    _sections = {
      favorites: {
        section: getElement<HTMLElement>('favorites-section'),
        list: getElement<HTMLElement>('favorites-list'),
        count: getElement<HTMLElement>('favorites-count'),
        content: getElement<HTMLElement>('favorites-content'),
        header: getElement<HTMLButtonElement>('[data-collapse-toggle="favorites"]'),
      },
      owned: {
        section: getElement<HTMLElement>('owned-section'),
        list: getElement<HTMLElement>('owned-list'),
        count: getElement<HTMLElement>('owned-count'),
        content: getElement<HTMLElement>('owned-content'),
        header: getElement<HTMLButtonElement>('[data-collapse-toggle="owned"]'),
      },
      public: {
        section: getElement<HTMLElement>('public-section'),
        list: getElement<HTMLElement>('public-list'),
        count: getElement<HTMLElement>('public-count'),
        content: getElement<HTMLElement>('public-content'),
        header: getElement<HTMLButtonElement>('[data-collapse-toggle="public"]'),
      },
      private: {
        section: getElement<HTMLElement>('private-section'),
        list: getElement<HTMLElement>('private-list'),
        count: getElement<HTMLElement>('private-count'),
        content: getElement<HTMLElement>('private-content'),
        header: getElement<HTMLButtonElement>('[data-collapse-toggle="private"]'),
      },
    };
  }
  return _sections;
};
