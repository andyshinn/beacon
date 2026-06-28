import { TextField } from "@radix-ui/themes";
import { ClearX, Search } from "../lib/icons";
import { useDiscoveryStore } from "../store/discoveryStore";

export function SearchField() {
	const query = useDiscoveryStore((s) => s.query);
	const setQuery = useDiscoveryStore((s) => s.setQuery);
	const clearSearch = useDiscoveryStore((s) => s.clearSearch);
	return (
		<TextField.Root
			id="beacon-search"
			size="2"
			placeholder="Search services, hosts, IPs…"
			spellCheck={false}
			value={query}
			onChange={(e) => setQuery(e.target.value)}
			style={{ flex: "0 1 200px", minWidth: 80 }}
		>
			<TextField.Slot>
				<Search />
			</TextField.Slot>
			{query && (
				<TextField.Slot>
					<button
						type="button"
						aria-label="Clear search"
						onClick={() => clearSearch()}
						style={{ all: "unset", cursor: "pointer", color: "var(--gray-10)", display: "flex" }}
					>
						<ClearX />
					</button>
				</TextField.Slot>
			)}
		</TextField.Root>
	);
}
