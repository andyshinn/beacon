export function App() {
	const isMac = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");
	return (
		<div className="bcn-app" data-staleness="fresh" data-platform={isMac ? "mac" : undefined}>
			<header className="bcn-toolbar">
				<div className="bcn-logo" />
				<span className="bcn-title" title="mDNS / Bonjour browser">
					Beacon
				</span>
			</header>
			<div className="bcn-body">
				<section className="bcn-list-pane" />
				<section className="bcn-detail-pane" />
			</div>
			<footer className="bcn-status-bar" />
		</div>
	);
}
