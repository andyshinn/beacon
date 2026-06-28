import { DetailPane } from "./components/DetailPane";
import { ListPane } from "./components/ListPane";
import { StatusBar } from "./components/StatusBar";
import { Toast } from "./components/Toast";
import { Toolbar } from "./components/Toolbar";

export function App() {
	const isMac = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");
	return (
		<div className="bcn-app" data-staleness="fresh" data-platform={isMac ? "mac" : undefined}>
			<header className="bcn-toolbar">
				<Toolbar />
			</header>
			<div className="bcn-body">
				<section className="bcn-list-pane">
					<ListPane />
				</section>
				<section className="bcn-detail-pane">
					<DetailPane />
				</section>
			</div>
			<footer className="bcn-status-bar">
				<StatusBar />
			</footer>
			<Toast />
		</div>
	);
}
