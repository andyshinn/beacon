import { Theme } from "@radix-ui/themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@radix-ui/themes/styles.css";
import "./styles/tokens.css";
import { App } from "./App";
import { useDiscoveryStore } from "./store/discoveryStore";

const { applySnapshot, applyDelta } = useDiscoveryStore.getState();
window.beacon.onSnapshot((snapshot) => applySnapshot(snapshot));
window.beacon.onDelta((delta) => applyDelta(delta));
// window.beacon.onStatus(...) — wired in Plan 3 (live/scanning indicators).

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
createRoot(container).render(
	<StrictMode>
		<Theme appearance="dark" accentColor="indigo" grayColor="slate" radius="medium">
			<App />
		</Theme>
	</StrictMode>,
);
