import { Theme } from "@radix-ui/themes";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "@radix-ui/themes/styles.css";
import "@fontsource-variable/lexend/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./styles/fonts.css";
import "./styles/tokens.css";
import { App } from "./App";
import { installKeyboard } from "./lib/keyboard";
import { installMenu } from "./lib/menu";
import { installNavigation } from "./lib/navigation";
import { useDiscoveryStore } from "./store/discoveryStore";
import { useSettingsStore } from "./store/settingsStore";

const store = useDiscoveryStore.getState();
window.beacon.onSnapshot((snapshot) => store.applySnapshot(snapshot));
window.beacon.onDelta((delta) => store.applyDelta(delta));
window.beacon.onStatus((status) => store.applyStatus(status));
window.beacon.onHealth(() => store.showPermissionHint());
void window.beacon.getSnapshot().then((snapshot) => store.applySnapshot(snapshot));

// Toast when a rescan finishes (scanning true → false).
let prevScanning = false;
useDiscoveryStore.subscribe((s) => {
	if (prevScanning && !s.status.scanning) s.showToast("Rescan complete");
	prevScanning = s.status.scanning;
});

function Root() {
	const appearance = useSettingsStore((s) => s.appearance);
	useEffect(() => {
		useDiscoveryStore.getState().tick(Date.now());
		const clock = setInterval(() => useDiscoveryStore.getState().tick(Date.now()), 1000);
		const removeKeys = installKeyboard();
		const removeNav = installNavigation();
		const removeMenu = installMenu();
		return () => {
			clearInterval(clock);
			removeKeys();
			removeNav();
			removeMenu();
		};
	}, []);
	return (
		<Theme appearance={appearance} accentColor="indigo" grayColor="slate" radius="medium">
			<App />
		</Theme>
	);
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
createRoot(container).render(
	<StrictMode>
		<Root />
	</StrictMode>,
);
