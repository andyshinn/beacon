import type { MouseEvent } from "react";
import { DisclosureDown, DisclosureRight } from "../../lib/icons";
import type { TreeChild, TreeGroup } from "../../lib/selectors";
import styles from "./Rows.module.css";

export function NewBadge() {
  return <span className={styles.newBadge}>NEW</span>;
}
export function LeftBadge() {
  return <span className={styles.leftBadge}>LEFT</span>;
}

export function TreeGroupRow({
  group,
  onToggle,
  onSelect,
}: {
  group: TreeGroup;
  onToggle: (e: MouseEvent) => void;
  onSelect: () => void;
}) {
  return (
    <button type="button" className={styles.groupRow} data-selected={group.selected || undefined} onClick={onSelect}>
      <span className={styles.disclosure} onClick={onToggle} aria-hidden>
        {group.expanded ? <DisclosureDown /> : <DisclosureRight />}
      </span>
      <span className={styles.titleBlock}>
        <span className={styles.groupTitle}>{group.title}</span>
        {group.subtitle && <span className={styles.subtitle}>{group.subtitle}</span>}
      </span>
      {group.chip && <span className={styles.grayChip}>{group.chip}</span>}
      {group.proto && <span className={styles.proto}>{group.proto}</span>}
      <span className={styles.countPill}>{group.count}</span>
    </button>
  );
}

export function TreeChildRow({ child, onSelect }: { child: TreeChild; onSelect: () => void }) {
  return (
    <button type="button" className={styles.childRow} data-selected={child.selected || undefined} onClick={onSelect}>
      <span className={styles.childCol}>
        <span className={styles.line1}>
          <span className={styles.childTitle}>{child.title}</span>
          {child.isNew && <NewBadge />}
          {child.isLeft && <LeftBadge />}
        </span>
        {child.subtitle && <span className={styles.childSub}>{child.subtitle}</span>}
      </span>
      {child.chip && <span className={styles.accentChip}>{child.chip}</span>}
      {child.port > 0 && <span className={styles.port}>:{child.port}</span>}
    </button>
  );
}
