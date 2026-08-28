import { catSlug } from './blog';

export type BlogCoverSize = 'hero' | 'card' | 'thumb';

const ACCENT = '#3363ff';

const MOTIFS: Record<string, string> = {
  ia: `<svg viewBox="0 0 120 120" fill="none"><circle cx="60" cy="60" r="18" stroke="${ACCENT}" stroke-width="1.4"/><circle cx="60" cy="60" r="4" fill="${ACCENT}"/><circle cx="28" cy="38" r="5" stroke="${ACCENT}" stroke-width="1.2"/><circle cx="92" cy="36" r="5" stroke="${ACCENT}" stroke-width="1.2"/><circle cx="24" cy="78" r="5" stroke="${ACCENT}" stroke-width="1.2"/><circle cx="96" cy="80" r="5" stroke="${ACCENT}" stroke-width="1.2"/><path d="M42 52 32 42M78 52 88 40M44 70 28 76M76 70 92 78M60 42V22M60 78v20" stroke="${ACCENT}" stroke-width="1" opacity=".7"/></svg>`,
  estrategica: `<svg viewBox="0 0 120 120" fill="none"><circle cx="60" cy="60" r="46" stroke="${ACCENT}" stroke-width="1" opacity=".35"/><circle cx="60" cy="60" r="30" stroke="${ACCENT}" stroke-width="1.2" opacity=".55"/><circle cx="60" cy="60" r="14" stroke="${ACCENT}" stroke-width="1.6"/><circle cx="60" cy="60" r="4" fill="${ACCENT}"/><circle cx="90" cy="38" r="3.5" fill="${ACCENT}"/></svg>`,
  indicadores: `<svg viewBox="0 0 120 120" fill="none"><path d="M22 88h76" stroke="${ACCENT}" stroke-width="1.2" opacity=".4"/><rect x="28" y="58" width="12" height="30" rx="2" fill="${ACCENT}" opacity=".35"/><rect x="48" y="40" width="12" height="48" rx="2" fill="${ACCENT}" opacity=".55"/><rect x="68" y="28" width="12" height="60" rx="2" fill="${ACCENT}"/><path d="M30 52l20-16 20 8 22-22" stroke="${ACCENT}" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  marketing: `<svg viewBox="0 0 120 120" fill="none"><circle cx="60" cy="60" r="38" stroke="${ACCENT}" stroke-width="1.2" opacity=".35"/><circle cx="60" cy="60" r="24" stroke="${ACCENT}" stroke-width="1.3" opacity=".55"/><circle cx="60" cy="60" r="10" stroke="${ACCENT}" stroke-width="1.6"/><circle cx="60" cy="60" r="3.5" fill="${ACCENT}"/><path d="M78 42l22-16" stroke="${ACCENT}" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  'planejamento-estrategico': `<svg viewBox="0 0 120 120" fill="none"><path d="M60 16l18 36 40 6-29 28 7 40-36-19-36 19 7-40L2 58l40-6z" stroke="${ACCENT}" stroke-width="1.4" fill="${ACCENT}" fill-opacity=".06"/><circle cx="60" cy="58" r="8" stroke="${ACCENT}" stroke-width="1.4"/></svg>`,
  novidades: `<svg viewBox="0 0 120 120" fill="none"><path d="M60 14v20M60 86v20M14 60h20M86 60h20M28 28l14 14M78 78l14 14M92 28L78 42M42 78L28 92" stroke="${ACCENT}" stroke-width="1.5" stroke-linecap="round"/><circle cx="60" cy="60" r="16" stroke="${ACCENT}" stroke-width="1.6"/><circle cx="60" cy="60" r="5" fill="${ACCENT}"/></svg>`,
  financeiro: `<svg viewBox="0 0 120 120" fill="none"><path d="M18 86c16-28 28-20 40-40 12 8 18 4 44-28" stroke="${ACCENT}" stroke-width="2" stroke-linecap="round"/><path d="M82 18h20v20" stroke="${ACCENT}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="58" cy="46" r="3.5" fill="${ACCENT}"/></svg>`,
  operacional: `<svg viewBox="0 0 120 120" fill="none"><path d="M60 22v16M60 82v16M22 60h16M82 60h16M34 34l12 12M74 74l12 12M86 34L74 46M46 74L34 86" stroke="${ACCENT}" stroke-width="1.3" stroke-linecap="round"/><circle cx="60" cy="60" r="18" stroke="${ACCENT}" stroke-width="1.6"/><circle cx="60" cy="60" r="7" stroke="${ACCENT}" stroke-width="1.4"/></svg>`,
  cultura: `<svg viewBox="0 0 120 120" fill="none"><circle cx="44" cy="42" r="12" stroke="${ACCENT}" stroke-width="1.5"/><circle cx="76" cy="42" r="12" stroke="${ACCENT}" stroke-width="1.5"/><circle cx="60" cy="70" r="12" stroke="${ACCENT}" stroke-width="1.5"/><path d="M28 92c2-14 10-20 16-20M92 92c-2-14-10-20-16-20M44 98c4-12 12-16 16-16s12 4 16 16" stroke="${ACCENT}" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  tecnologia: `<svg viewBox="0 0 120 120" fill="none"><rect x="38" y="38" width="44" height="44" rx="6" stroke="${ACCENT}" stroke-width="1.5"/><path d="M60 38V22M60 98V82M38 60H22M98 60H82M44 44l-12-12M76 76l12 12M76 44l12-12M44 76L32 88" stroke="${ACCENT}" stroke-width="1.2" stroke-linecap="round"/><circle cx="60" cy="60" r="6" fill="${ACCENT}"/></svg>`,
};

function categoryMotifKey(category: string): string {
  const s = catSlug(category);
  if (/ia|intelig|artificial/.test(s)) return 'ia';
  if (/market/.test(s)) return 'marketing';
  if (/indic|kpi|dados/.test(s)) return 'indicadores';
  if (/financ|preco|lucro|fatur|roi/.test(s)) return 'financeiro';
  if (/tech|digital|software|erp|plataform/.test(s)) return 'tecnologia';
  if (/operac|process|automat|implant/.test(s)) return 'operacional';
  if (/cultura|pessoas|equipe|talento|mentor/.test(s)) return 'cultura';
  if (/novidade|news/.test(s)) return 'novidades';
  if (/planej|estrat|gestao|escala/.test(s)) return 'planejamento-estrategico';
  return 'estrategica';
}

export function motifForCategory(category: string): string {
  return MOTIFS[categoryMotifKey(category)] || MOTIFS.estrategica;
}

export function autoHighlight(title: string): string | undefined {
  const colon = title.indexOf(':');
  if (colon > 6 && colon <= 40) return title.slice(0, colon).trim();
  if (colon > 0) {
    const after = title.slice(colon + 1).trim();
    if (after.length >= 8 && after.length <= 48) return after;
    if (after.length > 48) {
      const cut = after.slice(0, 42).lastIndexOf(' ');
      if (cut > 12) return after.slice(0, cut);
    }
  }
  const words = title.replace(/[()]/g, '').split(/\s+/);
  if (words.length >= 6) return words.slice(1, 5).join(' ');
  return undefined;
}

/** Divide o título em partes para destacar um trecho em azul. */
export function titleParts(title: string, highlight?: string): { before: string; em: string; after: string } {
  const hl = highlight || autoHighlight(title);
  if (!hl) return { before: title, em: '', after: '' };
  const idx = title.toLowerCase().indexOf(hl.toLowerCase());
  if (idx < 0) return { before: title, em: '', after: '' };
  return {
    before: title.slice(0, idx),
    em: title.slice(idx, idx + hl.length),
    after: title.slice(idx + hl.length),
  };
}

export function categoryClass(category: string): string {
  return categoryMotifKey(category).replace(/[^a-z0-9-]/gi, '');
}
