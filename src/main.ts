import {
  AuthError,
  ApiGuild,
  ApiGuildMember,
  fetchGuildMember,
  fetchGuilds,
  fetchMe,
  fetchWidget,
  logout,
} from './lib/api';
import {
  clearWidgetCache,
  createDefaultUserData,
  exportUserData,
  importUserData,
  loadUserData,
  saveUserData,
  toggleFavorite,
  updateNickname,
  updateNotes,
  updateWidgetCache,
  type UserDataStore,
  type WidgetCacheEntry,
} from './lib/storage';
import { createModalController } from './components/modal';
import { createServerCard, type ServerView } from './components/serverCard';
import { createToastManager, type ToastManager } from './components/toast';
import { createElement, getIconUrl } from './lib/utils';

type FilterKey = 'all' | 'owned' | 'partner' | 'verified' | 'boosted' | 'discoverable';

const filterTooltipCopy: Record<FilterKey, string> = {
  all: 'All servers',
  owned: 'Servers you administer',
  partner: 'Discord Partner Program',
  verified: 'Officially verified server',
  boosted: 'Nitro boost enabled',
  discoverable: 'Listed in Server Discovery',
};

interface AppState {
  me: string | null;
  guilds: ApiGuild[];
  userData: UserDataStore;
  filter: FilterKey;
  search: string;
}

interface SectionElements {
  section: HTMLElement;
  list: HTMLElement;
  count: HTMLElement;
}

interface DemoGuildEntry {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  owner: boolean;
  features: string[];
}

const getElement = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element as T;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasBoost = (features: string[]): boolean =>
  features.includes('ANIMATED_ICON') || features.includes('ANIMATED_BANNER');

const isDemoMode = new URLSearchParams(window.location.search).get('demo') === '1';
const DEMO_GUILDS_KEY = 'discord_manager_demo_guilds';
const DEMO_STORAGE_KEY = 'discord_manager_demo_user_data';
const storageOptions = isDemoMode ? { storageKey: DEMO_STORAGE_KEY } : undefined;

const state: AppState = {
  me: null,
  guilds: [],
  userData: loadUserData(storageOptions),
  filter: 'all',
  search: '',
};

const loginScreen = getElement<HTMLElement>('login-screen');
const loginActions = getElement<HTMLElement>('login-actions');
const demoLoader = getElement<HTMLElement>('demo-loader');
const demoFileInput = getElement<HTMLInputElement>('demo-file-input');
const demoStatus = getElement<HTMLElement>('demo-status');
const appShell = getElement<HTMLElement>('app-shell');
const searchInput = getElement<HTMLInputElement>('search-input');
const searchHelper = getElement<HTMLElement>('search-helper');
const emptyState = getElement<HTMLElement>('empty-state');
const statTotal = getElement<HTMLElement>('stat-total');
const statFavorites = getElement<HTMLElement>('stat-favorites');
const statOwned = getElement<HTMLElement>('stat-owned');
const statPublic = getElement<HTMLElement>('stat-public');

const sections: Record<string, SectionElements> = {
  favorites: {
    section: getElement<HTMLElement>('favorites-section'),
    list: getElement<HTMLElement>('favorites-list'),
    count: getElement<HTMLElement>('favorites-count'),
  },
  owned: {
    section: getElement<HTMLElement>('owned-section'),
    list: getElement<HTMLElement>('owned-list'),
    count: getElement<HTMLElement>('owned-count'),
  },
  public: {
    section: getElement<HTMLElement>('public-section'),
    list: getElement<HTMLElement>('public-list'),
    count: getElement<HTMLElement>('public-count'),
  },
  private: {
    section: getElement<HTMLElement>('private-section'),
    list: getElement<HTMLElement>('private-list'),
    count: getElement<HTMLElement>('private-count'),
  },
};

const toastRegion = getElement<HTMLElement>('toast-region');
const toast = createToastManager(toastRegion);
const fetchModal = createModalController(getElement('fetch-modal'));
const instructionsModal = createModalController(getElement('instructions-modal'));
const detailsModal = createModalController(getElement('details-modal'));
const detailsBody = getElement<HTMLElement>('details-body');

const getFetchStep = (step: string): HTMLElement => {
  const element = getElement<HTMLElement>('fetch-modal').querySelector<HTMLElement>(
    `[data-fetch-step="${step}"]`,
  );
  if (!element) {
    throw new Error(`Missing fetch step: ${step}`);
  }
  return element;
};

const fetchIntro = getFetchStep('intro');
const fetchProgress = getFetchStep('progress');
const fetchComplete = getFetchStep('complete');
const fetchSkipInfo = getElement<HTMLElement>('fetch-skip-info');
const fetchForce = getElement<HTMLInputElement>('fetch-force');
const fetchStart = getElement<HTMLButtonElement>('fetch-start');
const fetchStop = getElement<HTMLButtonElement>('fetch-stop');
const fetchButton = getElement<HTMLButtonElement>('btn-fetch');
const fetchTooltipAnchor = getElement<HTMLElement>('fetch-tooltip-anchor');
const fetchTooltip = getElement<HTMLElement>('fetch-tooltip');
const fetchProgressText = getElement<HTMLElement>('fetch-progress-text');
const fetchProgressDetail = getElement<HTMLElement>('fetch-progress-detail');
const fetchProgressBar = getElement<HTMLElement>('fetch-progress-bar');
const fetchCompleteText = getElement<HTMLElement>('fetch-complete-text');

let fetchShouldStop = false;

const showToast: ToastManager['show'] = (message, options) => {
  if (appShell.getAttribute('aria-hidden') === 'true') {
    return;
  }
  toast.show(message, options);
};

const closeAppOverlays = (): void => {
  fetchShouldStop = true;
  fetchModal.close();
  instructionsModal.close();
  detailsModal.close();
  toastRegion.replaceChildren();
};

const setScreen = (screen: 'login' | 'app'): void => {
  const isLogin = screen === 'login';
  loginScreen.setAttribute('aria-hidden', isLogin ? 'false' : 'true');
  appShell.setAttribute('aria-hidden', isLogin ? 'true' : 'false');
  loginScreen.classList.toggle('hidden', !isLogin);
  appShell.classList.toggle('hidden', isLogin);
  if (isLogin) {
    closeAppOverlays();
  }
  if (!isLogin) {
    document.querySelectorAll<HTMLElement>('[data-animate]').forEach((el) => {
      el.classList.add('fade-up');
    });
  }
};

const getWidgetView = (guildId: string): WidgetCacheEntry | null => {
  return state.userData.widgetCache[guildId] ?? null;
};

const buildServerViews = (): ServerView[] => {
  return state.guilds.map((guild) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.icon ?? null,
    banner: guild.banner ?? null,
    owner: guild.owner,
    features: guild.features ?? [],
    nickname: state.userData.nicknames[guild.id],
    notes: state.userData.notes[guild.id],
    isFavorite: state.userData.favorites.includes(guild.id),
    widget: getWidgetView(guild.id),
  }));
};

const matchesFilter = (server: ServerView, filter: FilterKey): boolean => {
  switch (filter) {
    case 'owned':
      return server.owner;
    case 'partner':
      return server.features.includes('PARTNERED');
    case 'verified':
      return server.features.includes('VERIFIED');
    case 'boosted':
      return hasBoost(server.features);
    case 'discoverable':
      return server.features.includes('DISCOVERABLE');
    default:
      return true;
  }
};

const matchesSearch = (server: ServerView, query: string): boolean => {
  if (!query) return true;
  const value = query.toLowerCase();
  const nickname = server.nickname?.toLowerCase() ?? '';
  return server.name.toLowerCase().includes(value) || nickname.includes(value);
};

const getDisplayName = (server: ServerView): string => server.nickname ?? server.name;

const startsWithAlphanumeric = (value: string): boolean => /^[0-9a-z]/i.test(value.trim());

const sortByName = (a: ServerView, b: ServerView): number => {
  const nameA = getDisplayName(a);
  const nameB = getDisplayName(b);
  return nameA.localeCompare(nameB);
};

const sortByBannerThenName = (a: ServerView, b: ServerView): number => {
  const hasBannerA = Boolean(a.banner);
  const hasBannerB = Boolean(b.banner);
  if (hasBannerA !== hasBannerB) {
    return hasBannerA ? -1 : 1;
  }
  const nameA = getDisplayName(a);
  const nameB = getDisplayName(b);
  const alphanumericA = startsWithAlphanumeric(nameA);
  const alphanumericB = startsWithAlphanumeric(nameB);
  if (alphanumericA !== alphanumericB) {
    return alphanumericA ? -1 : 1;
  }
  return nameA.localeCompare(nameB);
};

const renderSection = (key: string, servers: ServerView[]): void => {
  const section = sections[key];
  section.list.replaceChildren();
  section.count.textContent = `${servers.length}`;
  if (servers.length === 0) {
    section.section.classList.add('hidden');
    return;
  }
  section.section.classList.remove('hidden');
  servers.forEach((server) => {
    section.list.appendChild(
      createServerCard(server, {
        onToggleFavorite: (guildId) => {
          state.userData = toggleFavorite(state.userData, guildId, storageOptions);
          showToast(
            state.userData.favorites.includes(guildId)
              ? 'Added to favorites'
              : 'Removed from favorites',
          );
          render();
        },
        onOpenDetails: (guildId) => openDetails(guildId),
      }),
    );
  });
};

const render = (): void => {
  const servers = buildServerViews();
  const filtered = servers.filter((server) =>
    matchesFilter(server, state.filter) && matchesSearch(server, state.search.trim()),
  );

  const favorites = filtered.filter((server) => server.isFavorite).sort(sortByName);
  const owned = filtered.filter((server) => server.owner && !server.isFavorite).sort(sortByName);
  const publicServers = filtered
    .filter((server) => !server.owner && !server.isFavorite && Boolean(server.widget?.instantInvite))
    .sort(sortByBannerThenName);
  const privateServers = filtered
    .filter((server) => !server.owner && !server.isFavorite && !server.widget?.instantInvite)
    .sort(sortByBannerThenName);

  renderSection('favorites', favorites);
  renderSection('owned', owned);
  renderSection('public', publicServers);
  renderSection('private', privateServers);

  const allViews = buildServerViews();
  const favoritesTotal = allViews.filter((server) => server.isFavorite).length;
  const ownedTotal = allViews.filter((server) => server.owner).length;
  const publicTotal = allViews.filter((server) => server.widget?.instantInvite).length;
  statTotal.textContent = `${allViews.length}`;
  statFavorites.textContent = `${favoritesTotal}`;
  statOwned.textContent = `${ownedTotal}`;
  statPublic.textContent = `${publicTotal}`;

  emptyState.classList.toggle('hidden', allViews.length > 0);
  searchHelper.classList.toggle('hidden', state.search.trim().length > 0);
};

const setFilter = (filter: FilterKey): void => {
  state.filter = filter;
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
    const isActive = button.dataset.filter === filter;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  render();
};

const updateSearch = (value: string): void => {
  state.search = value;
  render();
};

const openDetails = async (guildId: string): Promise<void> => {
  const server = state.guilds.find((item) => item.id === guildId);
  if (!server) return;
  detailsBody.replaceChildren();

  const loading = createElement('p', 'muted', 'Loading server details...');
  detailsBody.appendChild(loading);
  detailsModal.open();

  let member: ApiGuildMember | null = null;
  if (!isDemoMode) {
    try {
      member = await fetchGuildMember(guildId);
    } catch (error) {
      if (error instanceof AuthError) {
        setScreen('login');
        return;
      }
      detailsBody.replaceChildren(createElement('p', 'muted', 'Unable to load server details.'));
      return;
    }
  }

  detailsBody.replaceChildren();

  const header = createElement('div', 'details-header');
  const icon = createElement('div', 'details-icon');
  const iconUrl = getIconUrl(server.id, server.icon ?? null);
  if (iconUrl) {
    const image = document.createElement('img');
    image.src = iconUrl;
    image.alt = `${server.name} icon`;
    image.onerror = () => image.remove();
    icon.appendChild(image);
  } else {
    icon.textContent = server.name.charAt(0).toUpperCase();
  }
  header.appendChild(icon);

  const headerText = createElement('div', 'details-title');
  headerText.appendChild(createElement('h4', '', server.name));
  const idRow = createElement('div', 'details-id-row');
  const idText = createElement('span', 'muted', `ID: ${server.id}`);
  const copyButton = createElement('button', 'btn btn-secondary', 'Copy ID');
  copyButton.type = 'button';
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(server.id);
      showToast('Server ID copied');
    } catch {
      showToast('Unable to copy ID', { variant: 'error' });
    }
  });
  idRow.append(idText, copyButton);
  headerText.appendChild(idRow);
  header.appendChild(headerText);
  detailsBody.appendChild(header);

  const meta = createElement('div', 'details-meta');
  const joinedAt = member?.joined_at ? new Date(member.joined_at).toLocaleDateString() : 'Unknown';
  const rolesCount = member?.roles ? member.roles.length : 0;
  const widgetStatus = state.userData.widgetCache[guildId]?.instantInvite ? 'Widget enabled' : 'Widget off';
  meta.appendChild(createElement('div', 'detail-row', `Joined: ${joinedAt}`));
  meta.appendChild(createElement('div', 'detail-row', `Roles: ${rolesCount}`));
  meta.appendChild(createElement('div', 'detail-row', widgetStatus));
  detailsBody.appendChild(meta);

  const nicknameField = createElement('div', 'form-field');
  const nicknameLabel = createElement('label', '', 'Nickname');
  nicknameLabel.setAttribute('for', 'nickname-input');
  const nicknameInput = document.createElement('input');
  nicknameInput.id = 'nickname-input';
  nicknameInput.type = 'text';
  nicknameInput.value = state.userData.nicknames[guildId] ?? '';
  nicknameField.append(nicknameLabel, nicknameInput);
  detailsBody.appendChild(nicknameField);

  const notesField = createElement('div', 'form-field');
  const notesLabel = createElement('label', '', 'Notes');
  notesLabel.setAttribute('for', 'notes-input');
  const notesInput = document.createElement('textarea');
  notesInput.id = 'notes-input';
  notesInput.value = state.userData.notes[guildId] ?? '';
  notesField.append(notesLabel, notesInput);
  detailsBody.appendChild(notesField);

  const actions = createElement('div', 'modal-actions');
  const saveButton = createElement('button', 'btn btn-primary', 'Save');
  saveButton.type = 'button';
  saveButton.addEventListener('click', () => {
    state.userData = updateNickname(state.userData, guildId, nicknameInput.value, storageOptions);
    state.userData = updateNotes(state.userData, guildId, notesInput.value, storageOptions);
    showToast('Details saved');
    render();
    detailsModal.close();
  });
  const cancelButton = createElement('button', 'btn btn-secondary', 'Cancel');
  cancelButton.type = 'button';
  cancelButton.addEventListener('click', () => detailsModal.close());
  actions.append(saveButton, cancelButton);
  detailsBody.appendChild(actions);
};

const updateFetchModalStep = (step: 'intro' | 'progress' | 'complete'): void => {
  if (fetchIntro && fetchProgress && fetchComplete) {
    fetchIntro.classList.toggle('hidden', step !== 'intro');
    fetchProgress.classList.toggle('hidden', step !== 'progress');
    fetchComplete.classList.toggle('hidden', step !== 'complete');
  }
};

const updateFetchSkipInfo = (): void => {
  if (fetchForce.checked) {
    fetchSkipInfo.textContent = 'All cached results will be cleared before fetching.';
    return;
  }
  const cachedCount = Object.keys(state.userData.widgetCache).length;
  fetchSkipInfo.textContent =
    cachedCount === 0
      ? 'No cached widget data yet.'
      : `${cachedCount} servers already cached and will be skipped.`;
};

const performWidgetFetch = async (): Promise<void> => {
  if (isDemoMode) {
    showToast('Demo mode uses local data only.');
    return;
  }
  fetchShouldStop = false;
  updateFetchModalStep('progress');
  fetchProgressBar.classList.remove('is-stopped');
  fetchProgressBar.style.width = '0%';
  fetchProgressText.textContent = 'Fetching server info...';
  fetchProgressDetail.textContent = '';
  const force = fetchForce.checked;
  if (force) {
    state.userData = clearWidgetCache(state.userData, storageOptions);
  }

  const serverIds = state.guilds.map((guild) => guild.id);
  const targets = force
    ? serverIds
    : serverIds.filter((id) => !state.userData.widgetCache[id]);

  const total = targets.length;
  let completed = 0;
  let updated = 0;

  if (total === 0) {
    updateFetchModalStep('complete');
    fetchCompleteText.textContent = 'No servers needed updates.';
    return;
  }

  for (const guildId of targets) {
    if (fetchShouldStop) {
      fetchProgressBar.classList.add('is-stopped');
      break;
    }
    try {
      const widget = await fetchWidget(guildId);
      const entry: WidgetCacheEntry = {
        instantInvite: widget.instant_invite ?? null,
        presenceCount: widget.presence_count ?? null,
        lastCached: new Date().toISOString(),
      };
      state.userData = updateWidgetCache(state.userData, guildId, entry, storageOptions);
      updated += 1;
    } catch (error) {
      if (error instanceof AuthError) {
        setScreen('login');
        return;
      }
      const entry: WidgetCacheEntry = {
        instantInvite: null,
        presenceCount: null,
        lastCached: new Date().toISOString(),
      };
      state.userData = updateWidgetCache(state.userData, guildId, entry, storageOptions);
    }
    completed += 1;
    const progress = total === 0 ? 100 : Math.round((completed / total) * 100);
    fetchProgressBar.style.width = `${progress}%`;
    fetchProgressText.textContent = `Fetching server info (${completed}/${total})`;
    fetchProgressDetail.textContent = `${updated} servers updated`;
  }

  updateFetchModalStep('complete');
  fetchCompleteText.textContent = fetchShouldStop
    ? `Stopped early. ${updated} servers updated.`
    : `Complete. ${updated} servers updated.`;
  render();
};

const handleImport = async (file: File): Promise<void> => {
  try {
    const content = await file.text();
    const parsed: unknown = JSON.parse(content);
    state.userData = importUserData(parsed, storageOptions);
    showToast('User data imported');
    render();
  } catch (error) {
    console.error(error);
    showToast('Import failed', { variant: 'error' });
  }
};

const handleExport = (): void => {
  const blob = new Blob([exportUserData(state.userData)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'user_data.json';
  link.click();
  URL.revokeObjectURL(url);
  showToast('User data exported');
};

const parseDemoGuilds = (value: unknown): DemoGuildEntry[] => {
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

const normalizeDemoGuilds = (guilds: DemoGuildEntry[]): ApiGuild[] =>
  guilds.map((guild) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.icon,
    banner: guild.banner,
    owner: guild.owner,
    features: guild.features,
  }));

const setDemoStatus = (message: string, variant: 'neutral' | 'error' = 'neutral'): void => {
  demoStatus.textContent = message;
  demoStatus.classList.toggle('is-error', variant === 'error');
};

const saveDemoGuilds = (guilds: ApiGuild[]): void => {
  localStorage.setItem(DEMO_GUILDS_KEY, JSON.stringify(guilds));
};

const loadDemoGuilds = (): ApiGuild[] | null => {
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

const ensureDemoWidgetCache = (guilds: ApiGuild[], data: UserDataStore): UserDataStore => {
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

const createDemoUserData = (guilds: ApiGuild[]): UserDataStore => {
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

const attachFilterTooltips = (): void => {
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
    if (button.closest('.tooltip-anchor')) {
      return;
    }
    const filter = button.dataset.filter as FilterKey | undefined;
    if (!filter) {
      return;
    }
    const tooltipText = filterTooltipCopy[filter];
    if (!tooltipText) {
      return;
    }
    const anchor = createElement('span', 'tooltip-anchor is-tooltip-active');
    const tooltip = createElement('span', 'tooltip-pill', tooltipText);
    const tooltipId = `filter-tooltip-${filter}`;
    tooltip.id = tooltipId;
    tooltip.setAttribute('role', 'tooltip');
    tooltip.setAttribute('aria-hidden', 'false');
    const parent = button.parentElement;
    if (!parent) {
      return;
    }
    parent.insertBefore(anchor, button);
    anchor.append(button, tooltip);
    button.setAttribute('aria-describedby', tooltipId);
  });
};

const applyDemoData = (guilds: ApiGuild[], options?: { resetUserData?: boolean }): void => {
  state.guilds = guilds;
  state.userData = options?.resetUserData
    ? createDemoUserData(guilds)
    : ensureDemoWidgetCache(guilds, loadUserData(storageOptions));
  setScreen('app');
  render();
};

const handleDemoFile = async (file: File): Promise<void> => {
  setDemoStatus('Loading...', 'neutral');
  try {
    const content = await file.text();
    const parsed: unknown = JSON.parse(content);
    const demoGuilds = parseDemoGuilds(parsed);
    if (demoGuilds.length === 0) {
      throw new Error('No guilds found');
    }
    const guilds = normalizeDemoGuilds(demoGuilds);
    saveDemoGuilds(guilds);
    applyDemoData(guilds, { resetUserData: true });
    setDemoStatus('Loaded.', 'neutral');
  } catch (error) {
    console.error(error);
    setDemoStatus('Invalid file. Expect guilds_api.json.', 'error');
  }
};

const setupDemoMode = (): void => {
  if (!isDemoMode) return;
  loginActions.classList.add('hidden');
  demoLoader.classList.remove('hidden');
};

const hydrateDemo = (): void => {
  const storedGuilds = loadDemoGuilds();
  if (!storedGuilds) {
    setDemoStatus('Load guilds_api.json to continue.', 'neutral');
    setScreen('login');
    return;
  }
  applyDemoData(storedGuilds, { resetUserData: false });
};

const setupEvents = (): void => {
  attachFilterTooltips();
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter as FilterKey | undefined;
      if (filter) {
        setFilter(filter);
      }
    });
  });

  searchInput.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    updateSearch(target.value);
  });

  getElement<HTMLButtonElement>('btn-export').addEventListener('click', handleExport);

  if (!isDemoMode) {
    fetchTooltip.setAttribute('aria-hidden', 'true');
    fetchButton.addEventListener('click', () => {
      updateFetchModalStep('intro');
      updateFetchSkipInfo();
      fetchModal.open();
    });
  } else {
    fetchButton.disabled = true;
    fetchButton.setAttribute('aria-disabled', 'true');
    fetchTooltipAnchor.classList.add('is-tooltip-active');
    fetchTooltipAnchor.setAttribute('tabindex', '0');
    fetchTooltipAnchor.setAttribute('aria-describedby', 'fetch-tooltip');
    fetchTooltip.setAttribute('aria-hidden', 'false');
  }

  getElement<HTMLButtonElement>('btn-instructions').addEventListener('click', () => {
    instructionsModal.open();
  });

  getElement<HTMLButtonElement>('btn-logout').addEventListener('click', async () => {
    if (isDemoMode) {
      setScreen('login');
      setDemoStatus('Load guilds_api.json to continue.', 'neutral');
      return;
    }
    try {
      await logout();
    } catch (error) {
      console.error(error);
    } finally {
      setScreen('login');
    }
  });

  const importInput = getElement<HTMLInputElement>('import-input');
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (file) {
      handleImport(file);
    }
    importInput.value = '';
  });

  if (isDemoMode) {
    demoFileInput.addEventListener('change', () => {
      const file = demoFileInput.files?.[0];
      if (file) {
        void handleDemoFile(file);
      }
      demoFileInput.value = '';
    });
  }

  fetchStart.addEventListener('click', () => {
    void performWidgetFetch();
  });
  fetchStop.addEventListener('click', () => {
    fetchShouldStop = true;
  });
  fetchForce.addEventListener('change', updateFetchSkipInfo);
};

const hydrateApp = async (): Promise<void> => {
  try {
    const me = await fetchMe();
    state.me = me.username;
  } catch (error) {
    if (error instanceof AuthError) {
      setScreen('login');
      return;
    }
    setScreen('app');
    showToast('Unable to verify session', { variant: 'error' });
    return;
  }

  setScreen('app');

  try {
    state.guilds = await fetchGuilds();
    render();
  } catch (error) {
    if (error instanceof AuthError) {
      setScreen('login');
      return;
    }
    showToast('Unable to load servers', { variant: 'error' });
  }
};


setupEvents();
setupDemoMode();
if (isDemoMode) {
  hydrateDemo();
} else {
  void hydrateApp();
}
