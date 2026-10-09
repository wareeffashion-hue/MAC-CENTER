// رسومات تجريدية لكل قسم بألوان الهوية، تعرض داخل «النوافذ» حتى تعتمد الصور الفعلية
// كل رسم symbol بإطار 400×400 ليتسع لأي نافذة عبر preserveAspectRatio=xMidYMid slice

const G = '#006442', D = '#084832', S = '#0C714F', Y = '#FFBA1D', Y2 = '#FFAE00', Y3 = '#FFC72E', C = '#FFF6E0', M = '#E3F1E9', W = '#FFFFFF';

export const ART = {
  fashion: `
    <rect width="400" height="400" fill="${M}"/>
    <circle cx="330" cy="70" r="120" fill="${W}" opacity=".7"/>
    <path d="M200 70a22 22 0 1 1 22 22v18l118 62" fill="none" stroke="${Y}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M222 110L104 172" fill="none" stroke="${Y}" stroke-width="14" stroke-linecap="round"/>
    <path d="M150 168l-62 34 24 54 32-14v158h156V242l32 14 24-54-62-34c-8 26-36 42-72 42s-64-16-72-42z" fill="${G}"/>
    <path d="M186 168c6 22 20 34 36 34s30-12 36-34" fill="none" stroke="${D}" stroke-width="10" stroke-linecap="round"/>
    <rect x="196" y="250" width="52" height="10" rx="5" fill="${Y3}"/>
    <path d="M40 300l-28 16 12 26 14-6v70h78v-70l14 6 12-26-28-16c-4 12-18 20-37 20s-33-8-37-20z" fill="${Y}"/>
    <circle cx="74" cy="360" r="6" fill="${D}"/>`,

  dress: `
    <rect width="400" height="400" fill="${D}"/>
    <circle cx="200" cy="420" r="230" fill="${S}"/>
    <circle cx="200" cy="420" r="160" fill="${G}"/>
    <path d="M178 60h44l-4 40 26 18-16 70h-82l-16-70 26-18z" fill="${Y}"/>
    <path d="M160 188h80l84 196H76z" fill="${Y3}"/>
    <path d="M160 188h80l84 196H76z" fill="url(#pleats)" opacity=".35"/>
    <path d="M150 188h100" stroke="${Y2}" stroke-width="12" stroke-linecap="round"/>
    <g fill="${C}">
      <path d="M70 90l6 16 16 6-16 6-6 16-6-16-16-6 16-6z"/>
      <path d="M328 150l4 11 11 4-11 4-4 11-4-11-11-4 11-4z"/>
      <path d="M318 60l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/>
    </g>`,

  bags: `
    <rect width="400" height="400" fill="${C}"/>
    <rect x="-20" y="250" width="440" height="170" fill="${Y3}" opacity=".45"/>
    <path d="M120 150a80 80 0 0 1 160 0" fill="none" stroke="${D}" stroke-width="16" stroke-linecap="round"/>
    <rect x="80" y="140" width="240" height="190" rx="34" fill="${G}"/>
    <rect x="80" y="196" width="240" height="18" fill="${D}" opacity=".5"/>
    <rect x="176" y="186" width="48" height="38" rx="10" fill="${Y}"/>
    <path d="M240 330c0-26 18-40 40-40h40c12 0 22-10 22-22v-34c0-8 6-14 14-14h0c8 0 14 6 14 14v96z" fill="${Y}"/>
    <path d="M356 234v96" stroke="${Y2}" stroke-width="10" stroke-linecap="round"/>
    <path d="M236 334h134" stroke="${D}" stroke-width="10" stroke-linecap="round"/>`,

  home: `
    <rect width="400" height="400" fill="${G}"/>
    <g opacity=".22" stroke="${C}" stroke-width="6">
      <path d="M0 40h400M0 80h400M0 120h400"/>
    </g>
    <rect x="40" y="220" width="320" height="130" rx="26" fill="${D}"/>
    <rect x="40" y="300" width="320" height="50" rx="16" fill="${S}"/>
    <rect x="66" y="150" width="140" height="110" rx="36" fill="${C}" transform="rotate(-8 136 205)"/>
    <rect x="190" y="148" width="150" height="116" rx="38" fill="${Y}" transform="rotate(6 265 206)"/>
    <g fill="${Y2}" transform="rotate(6 265 206)">
      <circle cx="232" cy="190" r="8"/><circle cx="265" cy="206" r="8"/><circle cx="298" cy="222" r="8"/>
      <circle cx="298" cy="190" r="8"/><circle cx="232" cy="222" r="8"/>
    </g>
    <path d="M86 196q50-18 100 0M86 220q50-18 100 0" fill="none" stroke="${G}" stroke-width="6" stroke-linecap="round" transform="rotate(-8 136 205)"/>
    <path d="M60 350v28M340 350v28" stroke="${D}" stroke-width="14" stroke-linecap="round"/>`,

  toys: `
    <rect width="400" height="400" fill="${Y}"/>
    <circle cx="300" cy="110" r="66" fill="${G}"/>
    <path d="M300 44a66 66 0 0 1 0 132M234 110h132" fill="none" stroke="${Y3}" stroke-width="10"/>
    <rect x="60" y="250" width="110" height="110" rx="18" fill="${D}"/>
    <rect x="170" y="250" width="110" height="110" rx="18" fill="${S}"/>
    <rect x="115" y="140" width="110" height="110" rx="18" fill="${G}" transform="rotate(-6 170 195)"/>
    <path d="M100 300l15-26 15 26zM205 322a20 20 0 1 0 40 0a20 20 0 1 0-40 0" fill="${Y3}"/>
    <path d="M152 170h36v36h-36z" fill="${Y3}" transform="rotate(-6 170 195)"/>
    <path d="M320 240l12 26 28 4-20 20 5 28-25-13-25 13 5-28-20-20 28-4z" fill="${C}"/>`,

  stationery: `
    <rect width="400" height="400" fill="${M}"/>
    <rect x="70" y="80" width="200" height="260" rx="20" fill="${G}" transform="rotate(-8 170 210)"/>
    <rect x="96" y="80" width="174" height="260" rx="14" fill="${C}" transform="rotate(-8 170 210)"/>
    <g stroke="${S}" stroke-width="5" stroke-linecap="round" opacity=".55" transform="rotate(-8 170 210)">
      <path d="M120 140h120M120 172h120M120 204h120M120 236h80"/>
    </g>
    <g transform="rotate(38 300 220)">
      <rect x="276" y="60" width="38" height="230" rx="6" fill="${Y}"/>
      <rect x="276" y="60" width="38" height="26" rx="6" fill="${D}"/>
      <path d="M276 290h38l-19 44z" fill="${C}"/>
      <path d="M288 318h14l-7 16z" fill="${D}"/>
    </g>
    <g transform="rotate(-24 120 330)">
      <rect x="30" y="320" width="220" height="36" rx="6" fill="${Y2}"/>
      <path d="M50 320v14M74 320v22M98 320v14M122 320v22M146 320v14M170 320v22M194 320v14M218 320v22" stroke="${D}" stroke-width="4"/>
    </g>`,

  mall: `
    <rect width="400" height="400" fill="${C}"/>
    <rect x="0" y="300" width="400" height="100" fill="${M}"/>
    <rect x="20" y="70" width="170" height="230" rx="10" fill="${G}"/>
    <rect x="210" y="40" width="170" height="260" rx="10" fill="${D}"/>
    <path d="M20 110h170l-14 26H34z" fill="${Y}"/>
    <path d="M210 84h170l-14 26H224z" fill="${Y3}"/>
    <rect x="40" y="150" width="130" height="120" rx="8" fill="${M}"/>
    <rect x="230" y="128" width="130" height="142" rx="8" fill="${S}"/>
    <path d="M70 230l26-46 26 46zM112 230a18 18 0 1 0 36 0z" fill="${Y}"/>
    <rect x="252" y="160" width="40" height="70" rx="20" fill="${Y}"/>
    <rect x="300" y="186" width="40" height="44" rx="8" fill="${C}"/>
    <g fill="${D}"><circle cx="150" cy="356" r="10"/><circle cx="186" cy="356" r="10"/></g>
    <path d="M100 320h20l12 26h70l10-26" fill="none" stroke="${Y2}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
};

export const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
  <pattern id="pleats" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M0 0v14" stroke="${Y2}" stroke-width="5"/></pattern>
  ${Object.entries(ART).map(([k, v]) => `<symbol id="art-${k}" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">${v}</symbol>`).join('')}
</defs></svg>`;

export function art(name, label = '') {
  return `<svg class="art" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}><use href="#art-${name}"/></svg>`;
}
