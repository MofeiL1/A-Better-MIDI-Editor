/**
 * Display-layer chord symbol formatting.
 * Converts internal text symbols to jazz graphic symbols when enabled.
 *
 * Internal (always text): maj7, dim, dim7, m7b5
 * Jazz display: △7, °, °7, ø7
 */

/** Apply jazz symbol formatting to a chord name or Roman numeral string. */
export function applyJazzSymbols(text: string): string {
  return text
    .replace(/maj13/g, '\u25B313')   // △13
    .replace(/maj9/g, '\u25B39')     // △9
    .replace(/maj7/g, '\u25B37')     // △7
    .replace(/m7b5/g, '\u00F87')     // ø7
    .replace(/dim7/g, '\u00B07')     // °7
    .replace(/dim/g, '\u00B0');      // °
}
