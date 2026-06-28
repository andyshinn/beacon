import { DetailPane } from "./components/DetailPane";
import { ListPane } from "./components/ListPane";
import { PaneDivider } from "./components/PaneDivider";
import { PermissionBanner } from "./components/PermissionBanner";
import { StatusBar } from "./components/StatusBar";
import { Toast } from "./components/Toast";
import { Toolbar } from "./components/Toolbar";
import { staleness } from "./lib/presence";
import { useDiscoveryStore } from "./store/discoveryStore";
import { useSettingsStore } from "./store/settingsStore";

export function App() {
	const isMac = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");
	const status = useDiscoveryStore((s) => s.status);
	const now = useDiscoveryStore((s) => s.now);
	const pausedAt = useDiscoveryStore((s) => s.pausedAt);
	const listPaneWidth = useSettingsStore((s) => s.listPaneWidth);
	const stale = staleness(status.live, status.live || pausedAt === 0 ? 0 : Math.floor((now - pausedAt) / 1000));
	return (
		<div className="bcn-app" data-staleness={stale} data-platform={isMac ? "mac" : undefined}>
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
