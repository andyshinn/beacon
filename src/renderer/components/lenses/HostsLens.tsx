// src/renderer/components/lenses/HostsLens.tsx
import type { TreeGroup } from "../../lib/selectors";
import { useDiscoveryStore } from "../../store/discoveryStore";
import { TreeChildRow, TreeGroupRow } from "../rows/TreeRows";

export function HostsLens({ groups }: { groups: TreeGroup[] }) {
	const toggleExpand = useDiscoveryStore((s) => s.toggleExpand);
	const selectHost = useDiscoveryStore((s) => s.selectHost);
	const selectInst = useDiscoveryStore((s) => s.selectInst);
	return (
		<>
			{groups.map((g) => (
				<div key={g.id}>
					<TreeGroupRow
						group={g}
						onToggle={(e) => {
							e.stopPropagation();
							toggleExpand(g.id);
						}}
						onSelect={() => selectHost(g.id.slice("host:".length))}
					/>
					{g.expanded && g.children.map((c) => <TreeChildRow key={c.id} child={c} onSelect={() => selectInst(c.id)} />)}
				</div>
			))}
		</>
	);
}
