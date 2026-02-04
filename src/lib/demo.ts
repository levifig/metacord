import type { ApiGuild } from './api';
import {
  createDefaultUserData,
  loadUserData,
  saveUserData,
  type UserDataStore,
  type WidgetCacheEntry,
} from './storage';
import {
  type DemoGuildEntry,
  DEMO_GUILDS_KEY,
  getElement,
  isDemoMode,
  isRecord,
  state,
  storageOptions,
} from './state';
import { render, setImportStatus, setScreen, showToast } from './render';

export let demoUserDataLoaded = false;

export const setDemoUserDataLoaded = (value: boolean): void => {
  demoUserDataLoaded = value;
};

export const parseDemoGuilds = (value: unknown): DemoGuildEntry[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): DemoGuildEntry | null => {
      if (!isRecord(entry)) return null;
      const id = typeof entry.id === 'string' ? entry.id : null;
      const name = typeof entry.name === 'string' ? entry.name : null;
      if (!id || !name) return null;
      const icon = typeof entry.icon === 'string' ? entry.icon : null;
      const banner = typeof entry.banner === 'string' ? entry.banner : null;
      const owner = typeof entry.owner === 'boolean' ? entry.owner : false;
      const features = Array.isArray(entry.features)
        ? entry.features.filter((item): item is string => typeof item === 'string')
        : [];
      return { id, name, icon, banner, owner, features };
    })
    .filter((entry): entry is DemoGuildEntry => entry !== null);
};

export const normalizeDemoGuilds = (guilds: DemoGuildEntry[]): ApiGuild[] =>
  guilds.map((guild) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.icon,
    banner: guild.banner,
    owner: guild.owner,
    features: guild.features,
  }));

export const setDemoStatus = (message: string, variant: 'neutral' | 'error' = 'neutral'): void => {
  const demoStatus = getElement<HTMLElement>('demo-status');
  demoStatus.textContent = message;
  demoStatus.classList.toggle('is-error', variant === 'error');
};

export const setDemoModalStatus = (
  message: string,
  variant: 'neutral' | 'error' = 'neutral',
): void => {
  const demoModalStatus = getElement<HTMLElement>('demo-modal-status');
  demoModalStatus.textContent = message;
  demoModalStatus.classList.toggle('is-error', variant === 'error');
};

export const saveDemoGuilds = (guilds: ApiGuild[]): void => {
  localStorage.setItem(DEMO_GUILDS_KEY, JSON.stringify(guilds));
};

export const loadDemoGuilds = (): ApiGuild[] | null => {
  try {
    const stored = localStorage.getItem(DEMO_GUILDS_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    const demoGuilds = parseDemoGuilds(parsed);
    if (demoGuilds.length === 0) return null;
    return normalizeDemoGuilds(demoGuilds);
  } catch (error) {
    console.error('Failed to load demo guilds', error);
    return null;
  }
};

export const ensureDemoWidgetCache = (guilds: ApiGuild[], data: UserDataStore): UserDataStore => {
  const widgetCache = { ...data.widgetCache };
  let updated = false;
  guilds.forEach((guild) => {
    if (!widgetCache[guild.id]) {
      widgetCache[guild.id] = {
        instantInvite: null,
        presenceCount: null,
        lastCached: null,
      };
      updated = true;
    }
  });

  if (!updated) {
    return data;
  }

  const next = { ...data, widgetCache };
  saveUserData(next, storageOptions);
  return next;
};

export const createDemoUserData = (guilds: ApiGuild[]): UserDataStore => {
  const base = createDefaultUserData();
  const widgetCache = guilds.reduce<Record<string, WidgetCacheEntry>>((acc, guild) => {
    acc[guild.id] = {
      instantInvite: null,
      presenceCount: null,
      lastCached: null,
    };
    return acc;
  }, {});
  const next = { ...base, widgetCache };
  saveUserData(next, storageOptions);
  return next;
};

export const applyDemoData = (guilds: ApiGuild[], options?: { resetUserData?: boolean }): void => {
  state.guilds = guilds;
  state.userData = options?.resetUserData
    ? createDemoUserData(guilds)
    : ensureDemoWidgetCache(guilds, loadUserData(storageOptions));
  setScreen('app');
  render();
};

export const handleDemoFile = async (file: File): Promise<boolean> => {
  const filename = file.name;
  setDemoStatus(`Loading ${filename}...`, 'neutral');
  setImportStatus(`Loading ${filename}...`, 'neutral');
  setDemoModalStatus(`Selected: ${filename}`, 'neutral');
  try {
    const content = await file.text();
    const parsed: unknown = JSON.parse(content);
    const demoGuilds = parseDemoGuilds(parsed);
    if (demoGuilds.length === 0) {
      throw new Error('No guilds found');
    }
    const guilds = normalizeDemoGuilds(demoGuilds);
    saveDemoGuilds(guilds);
    const shouldResetUserData = !demoUserDataLoaded;
    applyDemoData(guilds, { resetUserData: shouldResetUserData });
    setDemoStatus('Loaded.', 'neutral');
    setImportStatus('Loaded.', 'neutral');
    setDemoModalStatus('Loaded.', 'neutral');
    return true;
  } catch (error) {
    console.error(error);
    setDemoStatus('Invalid file. Expect guilds_api.json.', 'error');
    setImportStatus('Invalid file. Expect guilds_api.json.', 'error');
    setDemoModalStatus('Invalid file. Expect guilds_api.json.', 'error');
    return false;
  }
};

export const setupDemoMode = (): void => {
  if (!isDemoMode) return;
  const loginActions = getElement<HTMLElement>('login-actions');
  const demoLoader = getElement<HTMLElement>('demo-loader');
  const importTooltip = getElement<HTMLElement>('import-tooltip');
  loginActions.classList.add('hidden');
  demoLoader.classList.remove('hidden');
  importTooltip.textContent = 'Import user_data.json';
};

export const hydrateDemo = (): void => {
  const storedGuilds = loadDemoGuilds();
  if (!storedGuilds) {
    setDemoStatus('Load guilds_api.json to continue.', 'neutral');
    setScreen('login');
    return;
  }
  applyDemoData(storedGuilds, { resetUserData: false });
};
