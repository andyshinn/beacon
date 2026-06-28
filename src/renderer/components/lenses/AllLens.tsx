import type { FlatRow } from "../../lib/selectors";
import { useDiscoveryStore } from "../../store/discoveryStore";
import { FlatRowItem } from "../rows/FlatRow";

export function AllLens({ rows }: { rows: FlatRow[] }) {
	const selectInst = useDiscoveryStore((s) => s.selectInst);
	return (
		<>
			{rows.map((r) => (
				<FlatRowItem key={r.id} row={r} onSelect={() => selectInst(r.id)} />
			))}
		</>
	);
}
