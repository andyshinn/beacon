import type { BeaconApi } from "../shared/beacon-api";

declare global {
	interface Window {
		beacon: BeaconApi;
	}
}
