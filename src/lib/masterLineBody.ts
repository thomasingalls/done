/** The card text produced from a Goals line; markup-only and blank lines produce no card. */
export const masterLineBody = (line: string): string =>
  line.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '').trimEnd();
