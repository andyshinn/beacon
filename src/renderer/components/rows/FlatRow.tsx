import type { FlatRow } from "../../lib/selectors";
import styles from "./FlatRow.module.css";
import { LeftBadge, NewBadge } from "./TreeRows";

export function FlatRowItem({ row, onSelect }: { row: FlatRow; onSelect: () => void }) {
	return (
		<button type="button" className={styles.row} data-selected={row.selected || undefined} onClick={onSelect}>
			<span className={styles.col}>
				<span className={styles.line1}>
					<span className={styles.name}>{row.name}</span>
					{row.isNew && <NewBadge />}
					{row.isLeft && <LeftBadge />}
				</span>
				<span className={styles.type}>{row.serviceType}</span>
			</span>
			{row.chip && <span className={styles.chip}>{row.chip}</span>}
			{row.port > 0 && <span className={styles.port}>:{row.port}</span>}
		</button>
	);
}
