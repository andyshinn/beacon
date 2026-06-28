import { ToastCheck } from "../lib/icons";
import { useDiscoveryStore } from "../store/discoveryStore";
import styles from "./Toast.module.css";

export function Toast() {
	const toast = useDiscoveryStore((s) => s.toast);
	if (!toast) return null;
	return (
		<div className={styles.toast} role="status">
			<span className={styles.check}>
				<ToastCheck />
			</span>
			{toast}
		</div>
	);
}
