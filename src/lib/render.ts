import {
  AuthError,
  type ApiGuildMember,
} from './api';
import {
  toggleFavorite,
  updateNickname,
  updateNotes,
  type WidgetCacheEntry,
} from './storage';
import { createServerCard, type ServerView } from '../components/serverCard';
import type { ModalController } from '../components/modal';
import type { ToastManager } from '../components/toast';
import { createElement, getIconUrl } from './utils';
import { fetchGuildMember } from './api';
import {
  type FilterKey,
  getElement,
  getSections,
  isDemoMode,
  state,
  storageOptions,
} from './state';

// Re-export ServerView for convenience
export type { ServerView } from '../components/serverCard';

// --- Toast integration ---

let _toast: ToastManager | null = null;
let _appShell: HTMLElement | null = null;

export const initShowToast = (toast: ToastManager, appShell: HTMLElement): void => {
  _toast = toast;
  _appShell = appShell;
};

export const showToast: ToastManager['show'] = (message, options) => {
  if (!_toast || !_appShell) return;
  if (_appShell.getAttribute('aria-hidden') === 'true') {
    return;
  }
  _toast.show(message, options);
};

// --- Screen switching ---

let _closeAppOverlays: (() => void) | null = null;

export const initSetScreen = (closeAppOverlays: () => void): void => {
  _closeAppOverlays = closeAppOverlays;
};

export const setScreen = (screen: 'login' | 'app'): void => {
  const loginScreen = getElement<HTMLElement>('login-screen');
  const appShell = getElement<HTMLElement>('app-shell');
  const isLogin = screen === 'login';
  loginScreen.setAttribute('aria-hidden', isLogin ? 'false' : 'true');
  appShell.setAttribute('aria-hidden', isLogin ? 'true' : 'false');
  loginScreen.classList.toggle('hidden', !isLogin);
  appShell.classList.toggle('hidden', isLogin);
  if (isLogin) {
    _closeAppOverlays?.();
  }
  if (!isLogin) {
    document.querySelectorAll<HTMLElement>('[data-animate]').forEach((el) => {
      el.classList.add('fade-up');
    });
  }
};

// --- Import status ---

export const setImportStatus = (message: string, variant: 'neutral' | 'error' = 'neutral'): void => {
  const importStatus = getElement<HTMLElement>('import-status');
  importStatus.textContent = message;
  importStatus.classList.toggle('is-error', variant === 'error');
};

// --- Filtering & sorting helpers ---

export const hasBoost = (features: string[]): boolean =>
  features.includes('ANIMATED_ICON') || features.includes('ANIMATED_BANNER');

export const getWidgetView = (guildId: string): WidgetCacheEntry | null => {
  return state.userData.widgetCache[guildId] ?? null;
};

export const buildServerViews = (): ServerView[] => {
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

export const matchesSingleFilter = (server: ServerView, filter: FilterKey): boolean => {
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

export const matchesFilter = (server: ServerView, activeFilters: Set<FilterKey>): boolean => {
  if (activeFilters.size === 0) {
    return true;
  }
  for (const filter of activeFilters) {
    if (!matchesSingleFilter(server, filter)) {
      return false;
    }
  }
  return true;
};

export const matchesSearch = (server: ServerView, query: string): boolean => {
  if (!query) return true;
  const value = query.toLowerCase();
  const nickname = server.nickname?.toLowerCase() ?? '';
  return server.name.toLowerCase().includes(value) || nickname.includes(value);
};

export const getDisplayName = (server: ServerView): string => server.nickname ?? server.name;

export const startsWithAlphanumeric = (value: string): boolean => /^[0-9a-z]/i.test(value.trim());

export const sortByName = (a: ServerView, b: ServerView): number => {
  const nameA = getDisplayName(a);
  const nameB = getDisplayName(b);
  return nameA.localeCompare(nameB);
};

export const sortByBannerThenName = (a: ServerView, b: ServerView): number => {
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

// --- Section rendering ---

let _detailsModal: ModalController | null = null;

export const initDetailsModal = (modal: ModalController): void => {
  _detailsModal = modal;
};

const renderSection = (key: string, servers: ServerView[]): void => {
  const sections = getSections();
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

// --- Main render ---

export const render = (): void => {
  const allViews = buildServerViews();
  const filtered = allViews.filter((server) =>
    matchesFilter(server, state.activeFilters) && matchesSearch(server, state.search.trim()),
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

  const statTotal = getElement<HTMLElement>('stat-total');
  const statFavorites = getElement<HTMLElement>('stat-favorites');
  const statOwned = getElement<HTMLElement>('stat-owned');
  const statPublic = getElement<HTMLElement>('stat-public');
  const emptyState = getElement<HTMLElement>('empty-state');
  const searchHelper = getElement<HTMLElement>('search-helper');

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

// --- Details modal ---

export const openDetails = async (guildId: string): Promise<void> => {
  const server = state.guilds.find((item) => item.id === guildId);
  if (!server) return;
  const detailsBody = getElement<HTMLElement>('details-body');
  detailsBody.replaceChildren();

  const loading = createElement('p', 'muted', 'Loading server details...');
  detailsBody.appendChild(loading);
  _detailsModal?.open();

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
    _detailsModal?.close();
  });
  const cancelButton = createElement('button', 'btn btn-secondary', 'Cancel');
  cancelButton.type = 'button';
  cancelButton.addEventListener('click', () => _detailsModal?.close());
  actions.append(saveButton, cancelButton);
  detailsBody.appendChild(actions);
};
