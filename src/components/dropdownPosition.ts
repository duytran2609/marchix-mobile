/** Keep an attached menu next to its trigger, within the safe viewport. */
export function attachedMenuPosition({ anchorTop, anchorHeight, top, bottom, gap, maxHeight }: {
  anchorTop: number; anchorHeight: number; top: number; bottom: number; gap: number; maxHeight: number;
}) {
  const below = Math.max(0, bottom - anchorTop - anchorHeight - gap);
  const above = Math.max(0, anchorTop - gap - top);
  const opensAbove = below < maxHeight && above > below;
  const height = Math.min(maxHeight, opensAbove ? above : below);
  return { opensAbove, top: opensAbove ? Math.max(top, anchorTop - gap - height) : anchorTop + anchorHeight + gap, height };
}
