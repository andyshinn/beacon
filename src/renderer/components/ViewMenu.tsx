import { DropdownMenu, Flex, IconButton, Switch, Text, Tooltip } from "@radix-ui/themes";
import { ViewOptions } from "../lib/icons";
import { type SortBy, useSettingsStore } from "../store/settingsStore";

const SORTS: { value: SortBy; label: string }[] = [
	{ value: "name", label: "Name" },
	{ value: "ip", label: "IP address" },
	{ value: "lastseen", label: "Last seen" },
];

export function ViewMenu() {
	const sortBy = useSettingsStore((s) => s.sortBy);
	const setSortBy = useSettingsStore((s) => s.setSortBy);
	const showDesc = useSettingsStore((s) => s.showDesc);
	const showV6 = useSettingsStore((s) => s.showV6);
	const showLinkLocal = useSettingsStore((s) => s.showLinkLocal);
	const toggleShowDesc = useSettingsStore((s) => s.toggleShowDesc);
	const toggleShowV6 = useSettingsStore((s) => s.toggleShowV6);
	const toggleShowLinkLocal = useSettingsStore((s) => s.toggleShowLinkLocal);

	const toggleRow = (label: string, checked: boolean, onChange: () => void) => (
		// Plain row (not DropdownMenu.Item) so toggling does not close the menu.
		// Uses div+onClick instead of <label> to satisfy a11y (Switch renders a
		// <button>, not an <input>, so a wrapping <label> has no associated control).
		<Flex
			align="center"
			justify="between"
			px="2"
			py="1"
			gap="3"
			style={{ cursor: "pointer", borderRadius: 7, fontSize: 12.5 }}
			onClick={onChange}
		>
			<Text size="2">{label}</Text>
			<Switch size="1" color="indigo" checked={checked} onCheckedChange={onChange} onClick={(e) => e.stopPropagation()} />
		</Flex>
	);

	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				<Tooltip content="View options">
					<IconButton variant="ghost" size="2" aria-label="View options">
						<ViewOptions />
					</IconButton>
				</Tooltip>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content style={{ width: 236 }}>
				<DropdownMenu.Label>Sort by</DropdownMenu.Label>
				<DropdownMenu.RadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
					{SORTS.map((s) => (
						<DropdownMenu.RadioItem key={s.value} value={s.value}>
							{s.label}
						</DropdownMenu.RadioItem>
					))}
				</DropdownMenu.RadioGroup>
				<DropdownMenu.Separator />
				<DropdownMenu.Label>Show</DropdownMenu.Label>
				{toggleRow("Service descriptions", showDesc, toggleShowDesc)}
				{toggleRow("IPv6 addresses", showV6, toggleShowV6)}
				{toggleRow("Link-local addresses", showLinkLocal, toggleShowLinkLocal)}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	);
}
