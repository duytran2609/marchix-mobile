export const maxChecklistWeight = Math.floor(Number.MAX_SAFE_INTEGER / 30);

export function validChecklistWeight(weight: unknown): weight is number {
  return typeof weight === 'number' && Number.isSafeInteger(weight) && weight > 0 && weight <= maxChecklistWeight;
}

export function checklistWeight(weight?: number) {
  return validChecklistWeight(weight) ? weight : 1;
}

export function checklistProgress(items: readonly { weight?: number; done?: boolean }[]) {
  let total = 0;
  let completed = 0;
  for (const item of items) {
    const weight = checklistWeight(item.weight);
    total += weight;
    if (item.done === true) completed += weight;
  }
  return total ? Math.round(completed / total * 100) : 0;
}
