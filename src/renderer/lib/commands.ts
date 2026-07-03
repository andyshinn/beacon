import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { toCSV, toJSON, toText, triggerDownload } from "./export";
import { primaryIp, trunc } from "./presence";
import { visibleInstances } from "./selectors";

export async function toggleLive(): Promise<void> {
  const { live } = useDiscoveryStore.getState().status;
  await window.beacon.setLive(!live);
}

export async function rescan(): Promise<void> {
  await window.beacon.rescan();
}

export async function copyText(text: string, label?: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    /* clipboard unavailable */
  }
  useDiscoveryStore.getState().showToast(`Copied ${trunc(label ?? text)}`);
}

export async function openUrl(url: string): Promise<void> {
  await window.beacon.openExternal(url);
  useDiscoveryStore.getState().showToast(`Opening ${url}`);
}

export async function resolveInstance(key: string): Promise<void> {
  const s = useDiscoveryStore.getState();
  const it = s.instances.get(key);
  const h = it ? s.hosts.get(it.hostId) : undefined;
  await window.beacon.resolve(key);
  s.showToast(`Resolved ${h?.hostname ?? key} → ${primaryIp(h) ?? "—"}`);
}

export function revealHost(hostId: string): void {
  useSettingsStore.getState().setMode("host");
  useDiscoveryStore.getState().selectHost(hostId);
}

export function runDetailAction(action: { kind: string; value: string }): void {
  if (action.kind === "open") void openUrl(action.value);
  else if (action.kind === "copy") void copyText(action.value);
  else if (action.kind === "resolve") void resolveInstance(action.value);
  else if (action.kind === "reveal") revealHost(action.value);
}

export function exportAs(kind: "json" | "csv" | "txt"): Promise<void> | void {
  const s = useDiscoveryStore.getState();
  const visible = visibleInstances([...s.instances.values()], s.hosts, s.query);
  if (kind === "json") {
    triggerDownload("beacon-snapshot.json", "application/json", toJSON(visible, s.hosts));
    s.showToast(`Exported ${visible.length} records as JSON`);
  } else if (kind === "csv") {
    triggerDownload("beacon-snapshot.csv", "text/csv", toCSV(visible, s.hosts));
    s.showToast(`Exported ${visible.length} records as CSV`);
  } else {
    return copyText(toText(visible, s.hosts), "snapshot");
  }
}
