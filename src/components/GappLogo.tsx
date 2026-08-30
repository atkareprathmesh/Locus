/**
 * Bundled Google-app logos, drawn as inline SVG so they render sharp, offline,
 * and with no wrapper tile / coloured border. Google no longer serves distinct
 * favicons for most of its products, so a fetched icon is either the generic "G"
 * or a globe — hence these. Simplified brand marks, recognisable by shape+colour.
 *
 * Any key missing here falls back to the letter tile (see `hasGappLogo`).
 */

type Logo = { vb: string; body: string }

/** Coloured document with a folded corner + content — shared by Docs-family apps. */
const doc = (fill: string, corner: string, content: string) =>
  `<path fill="${fill}" d="M13 3h16l9 9v31a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>` +
  `<path fill="${corner}" d="M29 3l9 9h-9z"/>` +
  content

const L: Record<string, Logo> = {
  gmail: {
    vb: '0 0 48 48',
    body: `<path fill="#EA4335" d="M6 12.9 24 26 42 12.9v-.9a4 4 0 0 0-6.4-3.2L24 15.4 12.4 8.8A4 4 0 0 0 6 12z"/><path fill="#FBBC04" d="M42 12v24a2 2 0 0 1-2 2h-4V21.4l6-4.5z"/><path fill="#34A853" d="M6 12v24a2 2 0 0 0 2 2h4V21.4l-6-4.5z" opacity="0"/><path fill="#4285F4" d="M6 12.9V36a2 2 0 0 0 2 2h4V21.4L6 12.9z"/><path fill="#C5221F" d="M42 12.9V36a2 2 0 0 1-2 2h-4V21.4l6-8.5z" opacity="0"/><path fill="#34A853" d="M36 38h4a2 2 0 0 0 2-2V12.9l-6 8.5V38z"/><path fill="#fff" d="M12 21.4 24 26l12-4.6V38H12z"/><path fill="#C5221F" d="M12 12.9 24 21.4V26L12 21.4z" opacity="0"/>`,
  },
  drive: {
    vb: '0 0 48 48',
    body: `<path fill="#1967D2" d="M16.5 6 3.6 28.3a3 3 0 0 0 0 3l6 10.4L28.9 8.4 19 6a3 3 0 0 0-2.5 0z" opacity="0"/><path fill="#1E88E5" d="M17.8 6.5 4.4 29.7a2 2 0 0 0 0 2l5.6 9.6L37 14.8 20.3 6a2 2 0 0 0-2.5.5z" opacity="0"/><path fill="#188038" d="M10 41.3a2 2 0 0 0 1.7 1h24.6a2 2 0 0 0 1.7-1l3.2-5.5H6.8L10 41.3z"/><path fill="#1967D2" d="M17.8 6.5a2 2 0 0 1 1.7-1h9a2 2 0 0 0-1.7 1L10 35.8H3.6a2 2 0 0 1-.3-2.4L17.8 6.5z"/><path fill="#4285F4" d="M18.5 5.5h9a2 2 0 0 1 1.7 1L44 33.4a2 2 0 0 1-.3 2.4H31L16.8 6.5a2 2 0 0 1 1.7-1z" opacity="0"/><path fill="#FBBC04" d="M44.7 33.4 30.5 6.5a2 2 0 0 0-1.7-1h-9a2 2 0 0 1 1.7 1l14.2 26.9a2 2 0 0 1-.3 2.4h7.3a2 2 0 0 0 2-3.4z"/><path fill="#188038" d="M27.5 5.5h1.3a2 2 0 0 1 1.7 1L44.7 33.4a2 2 0 0 1-1.7 2.9h-6.4L23.2 12 27.5 5.5z" opacity="0"/><path fill="#4285F4" d="M35.9 35.8H10L23 12l13 23.8z" opacity="0"/><path fill="#2684FC" d="M10 35.8h26l-3.2 5.5-.8-.3H14z" opacity="0"/><path fill="#4285F4" d="M36 35.8H10l13-24 13 24z"/>`,
  },
  calendar: {
    vb: '0 0 48 48',
    body: `<rect x="9" y="9" width="30" height="30" rx="1.5" fill="#fff"/><path fill="#1A73E8" d="M11 6h26a2 2 0 0 1 2 2v5H9V8a2 2 0 0 1 2-2z"/><path fill="#188038" d="M39 40a2 2 0 0 1-2 2h-5v-3h7z" opacity="0"/><text x="24" y="31" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="700" fill="#1A73E8" text-anchor="middle">31</text><path fill="none" stroke="#E0E0E0" stroke-width="0" d="M0 0"/>`,
  },
  docs: {
    vb: '0 0 48 48',
    body: doc('#4285F4', '#A1C2FA', `<path fill="#fff" d="M17 19h14v2H17zm0 5h14v2H17zm0 5h10v2H17z"/>`),
  },
  sheets: {
    vb: '0 0 48 48',
    body: doc(
      '#188038',
      '#A8DAB5',
      `<path fill="#fff" d="M16 18h16v13H16V18zm2 2v2.7h4.5V20H18zm6.5 0v2.7H30V20h-5.5zM18 24.7v2.7h4.5v-2.7H18zm6.5 0v2.7H30v-2.7h-5.5z"/>`,
    ),
  },
  slides: {
    vb: '0 0 48 48',
    body: doc('#F9AB00', '#FCE8B2', `<path fill="#fff" d="M17 20h14v9H17z"/>`),
  },
  forms: {
    vb: '0 0 48 48',
    body: doc(
      '#7248B9',
      '#C7B2E5',
      `<path fill="#fff" d="M17.8 19.6l1.4-1.4 1.5 1.5-1.5 1.4-1.4-1.5zm5 0h8v1.6h-8zm-5 5l1.4-1.4 1.5 1.5-1.5 1.4-1.4-1.5zm5 .1h8v1.6h-8zm-5 4.9l1.4-1.4 1.5 1.5-1.5 1.4-1.4-1.5zm5 .1h8v1.6h-8z"/>`,
    ),
  },
  meet: {
    vb: '0 0 48 48',
    body: `<path fill="#00AC47" d="M6 15a3 3 0 0 1 3-3h17v24H9a3 3 0 0 1-3-3V15z"/><path fill="#0066DA" d="M26 12h-7l7 8v-8z" opacity="0"/><path fill="#00832D" d="M26 20v8l7 5V22.5L26 20z" opacity="0"/><path fill="#FFBA00" d="M40.6 12.7 33 18v12l7.6 5.3c1.3.9 3.1 0 3.1-1.6V14.3c0-1.6-1.8-2.5-3.1-1.6z"/><path fill="#2684FC" d="M33 30v-3.5L26 21v15h4a3 3 0 0 0 3-3v-3z"/><path fill="#0066DA" d="M33 18v3.5L26 16V12h4a3 3 0 0 1 3 3v3z"/><path fill="#EA4335" d="M6 15v-.2A3 3 0 0 1 9 12h4l-7 7v-4z" opacity="0"/>`,
  },
  maps: {
    vb: '0 0 48 48',
    body: `<path fill="#34A853" d="M11 22.5c1.7 3.4 4.4 6.4 6.8 9.4 1.6 2.6 3.5 5.5 4.4 8.3.4 1.2.7 2.8 1.8 2.8s1.4-1.6 1.8-2.8c.9-2.8 2.8-5.7 4.4-8.3l1.6-2L18.6 13.2A16 16 0 0 0 11 22.5z"/><path fill="#FBBC04" d="M24 2a16 16 0 0 0-11 4.4l7 8.2c1-1.2 2.4-2 4-2 2.9 0 5.3 2.3 5.4 5.2L36 12A16 16 0 0 0 24 2z"/><path fill="#4285F4" d="M31.4 32.2C34.4 28 38 22.7 38 18a16 16 0 0 0-2-7.8L18.6 30.3l1.4 1.9c1.6 2.6 3.5 5.5 4.4 8.3.4 1.2.7 2.8 1.8 2.8s1.4-1.6 1.8-2.8c.7-2.2 2-4.4 3.6-6.1z" opacity="0"/><path fill="#1A73E8" d="M24 24a5.4 5.4 0 1 0 0-10.8A5.4 5.4 0 0 0 24 24z"/><path fill="#EA4335" d="M13 6.4 24.5 20c1.1-4 4.6-6.9 8.8-7L36 12A16 16 0 0 0 13 6.4z" opacity="0"/><path fill="#4285F4" d="M35.9 10.2 24 24l1.9 2.5c1.9 2.6 4.2 5.8 5.2 8.5C34.9 30.6 40 24.9 40 18a16 16 0 0 0-4.1-7.8z"/><path fill="#FBBC04" d="M13 6.4a16 16 0 0 0-2 2.1l7 8.2 5-6.5-10-3.8z" opacity="0"/><path fill="#EA4335" d="M17.9 14.6 11 6.5A16 16 0 0 1 35.9 10.2L24 24 17.9 14.6z"/>`,
  },
  photos: {
    vb: '0 0 48 48',
    body: `<path fill="#FBBC04" d="M13 23a10 10 0 0 1 10-10V4a2 2 0 0 0-2-2h-1A17 17 0 0 0 3 19v2a2 2 0 0 0 2 2h8z"/><path fill="#EA4335" d="M25 13a10 10 0 0 1 10 10h9a2 2 0 0 0 2-2v-1A17 17 0 0 0 28 3h-1a2 2 0 0 0-2 2v8z"/><path fill="#34A853" d="M35 25a10 10 0 0 1-10 10v9a2 2 0 0 0 2 2h1a17 17 0 0 0 17-17v-1a2 2 0 0 0-2-2h-8z"/><path fill="#4285F4" d="M23 35a10 10 0 0 1-10-10H4a2 2 0 0 0-2 2v1a17 17 0 0 0 17 17h1a2 2 0 0 0 2-2v-8z"/>`,
  },
  keep: {
    vb: '0 0 48 48',
    body: `<path fill="#FFBC00" d="M24 4a16 16 0 0 0-10 28.5V37a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-4.5A16 16 0 0 0 24 4z"/><path fill="#000" d="M18 40h12v1a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3v-1z" opacity=".3"/><path fill="#fff" d="M17 33h14v2H17zm1-4h12v2H18z" opacity=".9"/>`,
  },
  tasks: {
    vb: '0 0 48 48',
    body: `<path fill="#1A73E8" d="M24 4C13 4 4 13 4 24s9 20 20 20 20-9 20-20S35 4 24 4zm-3 29L12.5 24.5l2.9-2.9 5.6 5.6L32.6 16l2.9 2.9L21 33z"/>`,
  },
  translate: {
    vb: '0 0 48 48',
    body: `<path fill="#4285F4" d="M6 8a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8z"/><path fill="#fff" d="M18.6 12.4H15v-1.7h-1.9v1.7H9.4v1.7h6.7c-.5 1.5-1.4 2.9-2.6 4-.7-.7-1.3-1.5-1.8-2.4h-1.9c.6 1.4 1.4 2.6 2.4 3.6l-3.4 3.3 1.3 1.3 3.3-3.3 2 2 .7-1.9-1.8-1.8c1.3-1.5 2.3-3.3 2.8-5.2h1.2v-1.7z"/><path fill="#34A853" d="M25 25a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H27a2 2 0 0 1-2-2V25z"/><path fill="#fff" d="M35.7 27.6h-3.4l-4.3 12h2.1l1-2.9h5.7l1 2.9h2.1l-4.3-12zm-2.9 7.4 2-5.7 2 5.7h-4z"/>`,
  },
  youtube: {
    vb: '0 0 48 48',
    body: `<path fill="#FF0000" d="M45 24s0-6.9-.9-10.2a5 5 0 0 0-3.5-3.5C37.3 9.4 24 9.4 24 9.4s-13.3 0-16.6.9a5 5 0 0 0-3.5 3.5C3 17.1 3 24 3 24s0 6.9.9 10.2a5 5 0 0 0 3.5 3.5c3.3.9 16.6.9 16.6.9s13.3 0 16.6-.9a5 5 0 0 0 3.5-3.5C45 30.9 45 24 45 24z"/><path fill="#fff" d="M19.8 30.5 31.3 24l-11.5-6.5v13z"/>`,
  },
  news: {
    vb: '0 0 48 48',
    body: `<path fill="#4285F4" d="M9 7h22a2 2 0 0 1 2 2v30a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><path fill="#1A73E8" d="M33 17h6a2 2 0 0 1 2 2v18a4 4 0 0 1-8 0V17z"/><rect x="11" y="11" width="12" height="8" rx="1" fill="#fff"/><path fill="#fff" d="M11 22h16v2H11zm0 5h16v2H11zm0 5h13v2H11z"/>`,
  },
  search: {
    vb: '0 0 48 48',
    body: `<path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.7-.4-4H24v7.6h11c-.5 2.6-2 4.8-4.2 6.3v5.2h6.8c4-3.7 6-9.1 6-15.1z"/><path fill="#34A853" d="M24 44c5.4 0 9.9-1.8 13.2-4.9l-6.8-5.2c-1.8 1.2-4.1 2-6.4 2-4.9 0-9.1-3.3-10.6-7.8H6.4v5.4C9.7 39.9 16.3 44 24 44z"/><path fill="#FBBC04" d="M13.4 28.1c-.4-1.2-.6-2.4-.6-3.6s.2-2.5.6-3.6v-5.4H6.4A20 20 0 0 0 4 24c0 3.2.8 6.3 2.4 9l7-4.9z"/><path fill="#EA4335" d="M24 12.6c2.9 0 5.5 1 7.5 2.9l5.7-5.7C33.9 6.6 29.4 4.8 24 4.8 16.3 4.8 9.7 8.9 6.4 15l7 5.4c1.5-4.5 5.7-7.8 10.6-7.8z"/>`,
  },
  gemini: {
    vb: '0 0 48 48',
    body: `<defs><linearGradient id="gem" x1="4" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4285F4"/><stop offset=".52" stop-color="#9B72CB"/><stop offset="1" stop-color="#D96570"/></linearGradient></defs><path fill="url(#gem)" d="M24 4c1.1 10.9 9.1 18.9 20 20-10.9 1.1-18.9 9.1-20 20-1.1-10.9-9.1-18.9-20-20 10.9-1.1 18.9-9.1 20-20z"/>`,
  },
  contacts: {
    vb: '0 0 48 48',
    body: `<rect x="8" y="6" width="34" height="36" rx="4" fill="#4285F4"/><rect x="4" y="14" width="4" height="6" rx="1" fill="#1A73E8"/><rect x="4" y="28" width="4" height="6" rx="1" fill="#1A73E8"/><circle cx="25" cy="21" r="6" fill="#fff"/><path fill="#fff" d="M15 35c0-5 4.5-8 10-8s10 3 10 8v1H15v-1z"/>`,
  },
  classroom: {
    vb: '0 0 48 48',
    body: `<rect x="6" y="9" width="36" height="30" rx="2" fill="#0F9D58"/><circle cx="24" cy="24" r="4.2" fill="#fff"/><path fill="#fff" d="M16 33c0-2.9 3.6-5 8-5s8 2.1 8 5v1H16v-1z"/><rect x="9" y="30" width="4" height="4" fill="#fff" opacity=".55"/><rect x="35" y="30" width="4" height="4" fill="#fff" opacity=".55"/>`,
  },
  earth: {
    vb: '0 0 48 48',
    body: `<circle cx="24" cy="24" r="20" fill="#1B7AE0"/><path fill="#2E7D32" d="M9 14c2.5.8 3.7 3.5 6.3 3.7 2.9.3 4.6-2.7 7.5-2.3 2.6.4 3 4 1.4 6-1.7 2.2-5.6 1.4-6.6 4-1 2.7 2 5.6.4 7.9-1.5 2.1-5.3.9-7.4-1.1A20 20 0 0 1 9 14z"/><path fill="#2E7D32" d="M32 8.5c1.8 2.2.7 5.6 2.9 7.4 1.8 1.5 4.7.7 6.2 2.4A20 20 0 0 0 32 8.5z"/><path fill="#FFF" d="M27 40.4c1-2.3-1-4.7.2-6.8 1.1-2 4.4-1.6 6.3-2.9 1.9-1.3 2.7-4.3 5-4.6a20 20 0 0 1-11.5 14.3z" opacity=".25"/>`,
  },
  play: {
    vb: '0 0 48 48',
    body: `<path fill="#00C4DE" d="M6.7 5.3 25.5 24 6.7 42.7A2.5 2.5 0 0 1 6 41V7c0-.7.3-1.3.7-1.7z"/><path fill="#00EC6D" d="M6.7 5.3A2.5 2.5 0 0 1 9.7 5l23 12.9-7.2 6.1L6.7 5.3z"/><path fill="#FF3945" d="M32.7 30.9 25.5 24l7.2-6.1 8.7 4.9c1.9 1 1.9 3.7 0 4.7l-8.7 4.4z"/><path fill="#FFC400" d="M9.7 43 32.7 30.9 25.5 24 6.7 42.7c.8.7 2 .8 3 .3z"/>`,
  },
}

export function hasGappLogo(key: string): boolean {
  return key in L
}

export function GappLogo({ appKey, size = 34 }: { appKey: string; size?: number }) {
  const logo = L[appKey]
  if (!logo) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox={logo.vb}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: logo.body }}
    />
  )
}
