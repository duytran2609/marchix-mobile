function normalize(value: string) {
  return value.trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ');
}

export function searchByName<T>(items: T[], query: string, nameOf: (item: T) => string): T[] {
  const term = normalize(query);
  if (!term) return items;

  const startsWithTerm: T[] = [];
  const containsTerm: T[] = [];
  for (const item of items) {
    const name = normalize(nameOf(item));
    if (name.startsWith(term)) startsWithTerm.push(item);
    else if (term.length > 1 && name.includes(term)) containsTerm.push(item);
  }
  return startsWithTerm.concat(containsTerm);
}
