import { createElement, formatNumber, getBannerUrl, getIconUrl } from '../lib/utils';

export interface ServerWidgetView {
  instantInvite: string | null;
  presenceCount: number | null;
}

export interface ServerView {
  id: string;
  name: string;
  icon?: string | null;
  banner?: string | null;
  owner: boolean;
  features: string[];
  nickname?: string;
  notes?: string;
  isFavorite: boolean;
  widget?: ServerWidgetView | null;
}

export interface ServerCardHandlers {
  onToggleFavorite: (guildId: string) => void;
  onOpenDetails: (guildId: string) => void;
}

const hasBoost = (features: string[]): boolean =>
  features.includes('ANIMATED_ICON') || features.includes('ANIMATED_BANNER');

export const createServerCard = (server: ServerView, handlers: ServerCardHandlers): HTMLElement => {
  const card = createElement('article', 'server-card');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Open details for ${server.nickname ?? server.name}`);
  card.dataset.guildId = server.id;

  if (server.owner) {
    card.classList.add('is-owned');
  }
  if (server.isFavorite) {
    card.classList.add('is-favorite');
  }

  const bannerUrl = getBannerUrl(server.id, server.banner ?? null);
  if (bannerUrl) {
    const banner = createElement('div', 'server-card-banner');
    banner.style.backgroundImage = `url(${bannerUrl})`;
    card.appendChild(banner);
  }

  const actions = createElement('div', 'card-actions');
  const favoriteButton = createElement('button', 'card-action');
  favoriteButton.type = 'button';
  favoriteButton.setAttribute('aria-pressed', server.isFavorite ? 'true' : 'false');
  favoriteButton.setAttribute('aria-label', server.isFavorite ? 'Unfavorite server' : 'Favorite server');
  favoriteButton.textContent = server.isFavorite ? '★' : '☆';
  if (server.isFavorite) {
    favoriteButton.classList.add('is-favorite');
  }
  favoriteButton.addEventListener('click', (event) => {
    event.stopPropagation();
    handlers.onToggleFavorite(server.id);
  });
  actions.appendChild(favoriteButton);

  if (server.widget?.instantInvite) {
    const inviteLink = createElement('a', 'card-action invite-link', '↗');
    inviteLink.href = server.widget.instantInvite;
    inviteLink.target = '_blank';
    inviteLink.rel = 'noopener';
    inviteLink.setAttribute('aria-label', 'Open public invite');
    inviteLink.addEventListener('click', (event) => event.stopPropagation());
    actions.appendChild(inviteLink);
  }

  card.appendChild(actions);

  const icon = createElement('div', 'server-icon');
  const iconUrl = getIconUrl(server.id, server.icon ?? null);
  if (iconUrl) {
    const image = document.createElement('img');
    image.src = iconUrl;
    image.alt = `${server.name} icon`;
    image.loading = 'lazy';
    image.onerror = () => image.remove();
    icon.appendChild(image);
  } else {
    icon.textContent = server.name.charAt(0).toUpperCase();
  }
  card.appendChild(icon);

  const content = createElement('div', 'server-card-content');
  const displayName = server.nickname && server.nickname.trim().length > 0 ? server.nickname : server.name;
  const nameRow = createElement('div', 'server-name-row');
  const name = createElement('div', 'server-name', displayName);
  nameRow.appendChild(name);
  content.appendChild(nameRow);

  if (displayName !== server.name) {
    const realName = createElement('div', 'server-real-name', server.name);
    content.appendChild(realName);
  }

  const badges = createElement('div', 'server-badges');
  if (server.owner) {
    badges.appendChild(createElement('span', 'badge badge-owner', 'Owner'));
  }
  if (server.features.includes('PARTNERED')) {
    badges.appendChild(createElement('span', 'badge badge-partner', 'Partner'));
  }
  if (server.features.includes('VERIFIED')) {
    badges.appendChild(createElement('span', 'badge badge-verified', 'Verified'));
  }
  if (hasBoost(server.features)) {
    badges.appendChild(createElement('span', 'badge badge-boosted', 'Boosted'));
  }
  if (server.features.includes('DISCOVERABLE')) {
    badges.appendChild(createElement('span', 'badge badge-discoverable', 'Discoverable'));
  }
  if (badges.children.length > 0) {
    content.appendChild(badges);
  }

  if (server.widget?.presenceCount) {
    const meta = createElement('div', 'server-meta');
    const online = createElement('span', 'online-count');
    const dot = createElement('span', 'online-dot');
    online.appendChild(dot);
    online.appendChild(document.createTextNode(formatNumber(server.widget.presenceCount)));
    meta.appendChild(online);
    content.appendChild(meta);
  }

  card.appendChild(content);

  const openDetails = (): void => handlers.onOpenDetails(server.id);
  card.addEventListener('click', openDetails);
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDetails();
    }
  });

  return card;
};
