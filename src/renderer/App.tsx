import { DetailPane } from "./components/DetailPane";
import { ListPane } from "./components/ListPane";
import { PaneDivider } from "./components/PaneDivider";
import { PermissionBanner } from "./components/PermissionBanner";
import { StatusBar } from "./components/StatusBar";
import { Toast } from "./components/Toast";
import { Toolbar } from "./components/Toolbar";
import { useDiscoveryStore } from "./store/discoveryStore";
import { useSettingsStore } from "./store/settingsStore";

export function App() {
	const isMac = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");
	const status = useDiscoveryStore((s) => s.status);
	const listPaneWidth = useSettingsStore((s) => s.listPaneWidth);
	return (
		<div className="bcn-app" data-paused={status.live ? undefined : true} data-platform={isMac ? "mac" : undefined}>
			<header className="bcn-toolbar">
				<Toolbar />
			</header>
			<div className="bcn-body">
				<section className="bcn-list-pane" style={{ width: listPaneWidth }}>
					<ListPane />
				</section>
				<PaneDivider />
				<section className="bcn-detail-pane">
					<DetailPane />
				</section>
			</div>
			<footer className="bcn-status-bar">
				<StatusBar />
			</footer>
			<Toast />
			<PermissionBanner />
		</div>
	);
}
