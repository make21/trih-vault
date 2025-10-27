export function stripHtmlAndDecode(input: string): string {
  if (!input) {
    return '';
  }

  const withoutTags = input.replace(/<[^>]*>/g, ' ');
  const decoded = decodeHtmlEntities(withoutTags);

  return decoded.replace(/\s+/g, ' ').trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const codePoint = parseInt(entity.slice(2), 16);
      if (!Number.isNaN(codePoint)) {
        return String.fromCodePoint(codePoint);
      }
      return match;
    }

    if (entity.startsWith('#')) {
      const codePoint = parseInt(entity.slice(1), 10);
      if (!Number.isNaN(codePoint)) {
        return String.fromCodePoint(codePoint);
      }
      return match;
    }

    return NAMED_ENTITIES[entity] ?? match;
  });
}
