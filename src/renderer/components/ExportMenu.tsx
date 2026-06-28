import { Button, DropdownMenu } from "@radix-ui/themes";
import { exportAs } from "../lib/commands";
import { Download } from "../lib/icons";

const OPTIONS: { kind: "json" | "csv" | "txt"; ext: string; label: string }[] = [
	{ kind: "json", ext: "JSON", label: "Export as JSON" },
	{ kind: "csv", ext: "CSV", label: "Export as CSV" },
	{ kind: "txt", ext: "TXT", label: "Copy as text" },
];

export function ExportMenu() {
	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				<Button color="indigo" variant="solid" size="2">
					<Download />
					Export
					<DropdownMenu.TriggerIcon />
				</Button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content style={{ width: 180 }}>
				{OPTIONS.map((o) => (
					<DropdownMenu.Item key={o.kind} onSelect={() => void exportAs(o.kind)}>
						<span
							style={{
								fontFamily: "var(--code-font-family)",
								fontSize: 10,
								fontWeight: 700,
								color: "var(--gray-10)",
								width: 30,
							}}
						>
							{o.ext}
						</span>
						{o.label}
					</DropdownMenu.Item>
				))}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	);
}
