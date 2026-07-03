import { type Selection, useDiscoveryStore } from "../store/discoveryStore";
import { type Lens, useSettingsStore } from "../store/settingsStore";

export interface NavLocation {
  mode: Lens;
  selection: Selection | null;
}

export function currentLocation(): NavLocation {
  return {
    mode: useSettingsStore.getState().mode,
    selection: useDiscoveryStore.getState().selection,
  };
}

export function sameLocation(a: NavLocation, b: NavLocation): boolean {
  if (a.mode !== b.mode) return false;
  const sa = a.selection;
  const sb = b.selection;
  if (sa === null || sb === null) return sa === sb;
  return sa.kind === sb.kind && sa.id === sb.id;
}

function applyLocation(loc: NavLocation): void {
  const disco = useDiscoveryStore.getState();
  useSettingsStore.getState().setMode(loc.mode);
  const sel = loc.selection;
  if (!sel) disco.clearSelection();
  else if (sel.kind === "inst") disco.selectInst(sel.id);
  else if (sel.kind === "svc") disco.selectSvc(sel.id);
  else if (sel.kind === "host") disco.selectHost(sel.id);
  else disco.selectIp(sel.id);
}

export function installNavigation(deps: { history?: History; win?: Window } = {}): () => void {
  const history = deps.history ?? window.history;
  const win = deps.win ?? window;

  let applying = false;
  let last = currentLocation();
  history.replaceState(last, "");

  const maybePush = (): void => {
    if (applying) return;
    const next = currentLocation();
    if (sameLocation(next, last)) return;
    last = next;
    history.pushState(next, "");
  };

  const onPopState = (e: PopStateEvent): void => {
    const loc = (e.state as NavLocation | null) ?? { mode: "service", selection: null };
    applying = true;
    try {
      applyLocation(loc);
      last = currentLocation();
    } finally {
      applying = false;
    }
  };

  const unsubMode = useSettingsStore.subscribe(maybePush);
  const unsubSelection = useDiscoveryStore.subscribe(maybePush);
  win.addEventListener("popstate", onPopState);

  return () => {
    unsubMode();
    unsubSelection();
    win.removeEventListener("popstate", onPopState);
  };
}
