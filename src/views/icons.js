// أيقونات خطية موحدة بسماكة 2 وإطار 24
const P = {
  whatsapp: '<path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z"/><path d="M9 8.6c.2 2.6 3.4 5.9 6.2 6.4l1.2-1.5-2-1-1 .9c-1-.5-2.3-1.7-2.9-2.9l.9-1-1-2z" fill="currentColor" stroke="none"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  chevron: '<path d="M15 6l-6 6 6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  google: '<path d="M20 12.2c0-.6-.1-1.2-.2-1.7H12v3.3h4.5a4 4 0 0 1-1.7 2.6v2.1h2.8A8.4 8.4 0 0 0 20 12.2z"/><path d="M12 20.5c2.3 0 4.2-.8 5.6-2l-2.8-2.1a5 5 0 0 1-7.6-2.7H4.4v2.2a8.5 8.5 0 0 0 7.6 4.6z"/><path d="M7.2 13.7a5 5 0 0 1 0-3.4V8.1H4.4a8.5 8.5 0 0 0 0 7.6z"/><path d="M12 6.9c1.3 0 2.5.4 3.4 1.3l2.5-2.5A8.5 8.5 0 0 0 4.4 8.1l2.8 2.2A5 5 0 0 1 12 6.9z"/>',
  instagram: '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.5"/><circle cx="16.8" cy="7.2" r=".8" fill="currentColor"/>',
  snapchat: '<path d="M12 4c3 0 5 2.2 5 5v2.2l1.8-.4c.5 0 .8.6.3.9l-2 1.1c.8 1.8 2 2.8 3.4 3.2-.3.8-1.5 1-2.6 1.1l-.4 1.3c-1.2-.2-2.4 0-3.3.8-1.3 1-3.1 1-4.4 0-.9-.8-2.1-1-3.3-.8l-.4-1.3c-1.1-.1-2.3-.3-2.6-1.1 1.4-.4 2.6-1.4 3.4-3.2l-2-1.1c-.5-.3-.2-.9.3-.9l1.8.4V9c0-2.8 2-5 5-5z"/>',
  tiktok: '<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.4 2.3 2 4 4.5 4.2"/>',
  x: '<path d="M5 4l14 16M19 4L5 20"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18M12 9v11M12 9c-2-4-6-4-6-1.5S12 9 12 9zm0 0c2-4 6-4 6-1.5S12 9 12 9z"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
};

export function icon(name, { size = 20, cls = '' } = {}) {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
