// src/renderer/components/lenses/ServicesLens.tsx
import type { TreeGroup } from "../../lib/selectors";
import { useDiscoveryStore } from "../../store/discoveryStore";
import { TreeChildRow, TreeGroupRow } from "../rows/TreeRows";

export function ServicesLens({ groups }: { groups: TreeGroup[] }) {
	const toggleExpand = useDiscoveryStore((s) => s.toggleExpand);
	const selectSvc = useDiscoveryStore((s) => s.selectSvc);
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
						onSelect={() => selectSvc(g.id.slice("svc:".length))}
					/>
					{g.expanded && g.children.map((c) => <TreeChildRow key={c.id} child={c} onSelect={() => selectInst(c.id)} />)}
				</div>
			))}
		</>
	);
}
