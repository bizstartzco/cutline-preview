// The side rail shared by every signed-in page, and the small formatters the
// marketplace pages use.
import { $, api, el, isPreview } from './common.js';

const ICONS = {
  campaigns: '<path d="M4 9.5 16 4l12 5.5L16 15 4 9.5Z"/><path d="M4 16l12 5.5L28 16M4 22.5 16 28l12-5.5"/>',
  clips: '<rect x="5" y="6" width="22" height="20" rx="4"/><path d="M13.5 12.5v7l6-3.5-6-3.5Z"/>',
  earnings: '<circle cx="16" cy="16" r="11"/><path d="M19.6 12.6c-.6-1.2-1.9-2-3.6-2-2 0-3.5 1.1-3.5 2.7 0 3.6 7.2 1.7 7.2 5.5 0 1.6-1.6 2.8-3.7 2.8-1.8 0-3.2-.8-3.8-2.1M16 8.5v15"/>',
  admin: '<path d="M6 9h20M6 16h20M6 23h20"/><circle cx="11" cy="9" r="2.4"/><circle cx="21" cy="16" r="2.4"/><circle cx="13" cy="23" r="2.4"/>',
};
const icon = (name) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name];
  return svg;
};

// Builds the rail once per page. `active` names the current section.
export async function mountShell(active) {
  if (isPreview || $('.rail')) return null;
  const market = await api('/market').catch(() => null);
  const items = [
    ['campaigns', '/campaigns', 'Campaigns'],
    ['clips', '/app', 'Clip maker'],
    ['earnings', '/earnings', 'Earnings'],
  ];
  if (market?.admin) items.push(['admin', '/admin', 'Admin']);
  const rail = el('nav', { class: 'rail', 'aria-label': 'Sections' });
  for (const [key, href, label] of items) {
    const link = el('a', { href, 'aria-current': key === active ? 'page' : false });
    link.append(icon(key), el('span', { text: label }));
    rail.append(link);
  }
  document.body.classList.add('has-rail');
  document.body.append(rail);
  return market;
}

export const money = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Rates and budgets are whole-dollar figures far more often than not.
export const dollars = (cents) => (cents % 100 === 0 ? `$${(cents / 100).toLocaleString('en-US')}` : money(cents));
export const compact = (n) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export const day = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const STATUS_TEXT = { draft: 'Draft', live: 'Live', paused: 'On hold', completed: 'Completed', pending: 'In review', approved: 'Approved', rejected: 'Rejected' };
export const chip = (status) => el('span', { class: `chip-status s-${status}`, text: STATUS_TEXT[status] || status });

// A cover image, or a generated one built from the campaign's name when none was uploaded.
export function cover(campaign) {
  const box = el('div', { class: 'cover' });
  if (campaign.cover) {
    box.append(el('img', { src: `/covers/${campaign.cover}`, alt: '', loading: 'lazy' }));
  } else {
    let hash = 0;
    for (const ch of campaign.id) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
    box.style.setProperty('--hue', String(hash));
    box.classList.add('generated');
    box.append(el('span', { class: 'cover-name', text: (campaign.brand || campaign.title).slice(0, 22) }));
  }
  return box;
}
