import { Toolbar } from "./components/Toolbar";

export function App() {
	const isMac = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");
	return (
		<div className="bcn-app" data-staleness="fresh" data-platform={isMac ? "mac" : undefined}>
			<header className="bcn-toolbar">
				<Toolbar />
			</header>
			<div className="bcn-body">
				<section className="bcn-list-pane" />
				<section className="bcn-detail-pane" />
			</div>
			<footer className="bcn-status-bar" />
		</div>
	);
}
