import { Box, Card, Code, Flex, Heading, Text } from "@radix-ui/themes";
import { selectRows, useDiscoveryStore } from "./store/discoveryStore";

export function App() {
	const rows = useDiscoveryStore(selectRows);
	return (
		<Box p="4">
			<Heading size="5" mb="3">
				Beacon — {rows.length} instance{rows.length === 1 ? "" : "s"}
			</Heading>
			<Flex direction="column" gap="2">
				{rows.map((r) => (
					<Card key={r.key}>
						<Flex justify="between" align="center" gap="3">
							<Text weight="medium">{r.name}</Text>
							<Code variant="ghost">{r.serviceType}</Code>
							<Text color="gray">{r.primaryIp ?? "—"}</Text>
						</Flex>
					</Card>
				))}
				{rows.length === 0 && <Text color="gray">Scanning the local network…</Text>}
			</Flex>
		</Box>
	);
}
