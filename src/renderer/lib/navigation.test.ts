import { beforeEach, describe, expect, it } from "vitest";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { installNavigation, type NavLocation } from "./navigation";

function fakeHistory() {
  const pushed: NavLocation[] = [];
  const box: { replaced: NavLocation | null } = { replaced: null };
  const history = {
    pushState: (state: NavLocation) => {
      pushed.push(state);
    },
    replaceState: (state: NavLocation) => {
      box.replaced = state;
    },
  } as unknown as History;
  return { history, pushed, box };
}

function popstate(state: NavLocation | null) {
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}

beforeEach(() => {
  useSettingsStore.setState({ mode: "service" });
  useDiscoveryStore.setState({ selection: null, query: "", expanded: new Set() });
});

describe("installNavigation", () => {
  it("seeds the initial entry with replaceState", () => {
    const h = fakeHistory();
    const dispose = installNavigation({ history: h.history, win: window });
    expect(h.box.replaced).toEqual({ mode: "service", selection: null });
    dispose();
  });

  it("pushes when the user changes mode", () => {
    const h = fakeHistory();
    const dispose = installNavigation({ history: h.history, win: window });
    useSettingsStore.getState().setMode("host");
    expect(h.pushed).toEqual([{ mode: "host", selection: null }]);
    dispose();
  });

  it("pushes when the user changes selection", () => {
    const h = fakeHistory();
    const dispose = installNavigation({ history: h.history, win: window });
    useDiscoveryStore.getState().selectHost("mac");
    expect(h.pushed).toEqual([{ mode: "service", selection: { kind: "host", id: "mac" } }]);
    dispose();
  });

  it("does not push for search-query changes", () => {
    const h = fakeHistory();
    const dispose = installNavigation({ history: h.history, win: window });
    useDiscoveryStore.getState().setQuery("shelly");
    expect(h.pushed).toEqual([]);
    dispose();
  });

  it("does not push for a no-op (same location) change", () => {
    const h = fakeHistory();
    const dispose = installNavigation({ history: h.history, win: window });
    useSettingsStore.getState().setMode("service");
    expect(h.pushed).toEqual([]);
    dispose();
  });

  it("applies a popstate location into the stores without re-pushing", () => {
    const h = fakeHistory();
    const dispose = installNavigation({ history: h.history, win: window });
    useSettingsStore.getState().setMode("host"); // one push
    popstate({ mode: "ip", selection: { kind: "host", id: "mac" } });
    expect(useSettingsStore.getState().mode).toBe("ip");
    expect(useDiscoveryStore.getState().selection).toEqual({ kind: "host", id: "mac" });
    expect(h.pushed).toHaveLength(1); // apply must not push
    dispose();
  });

  it("applies a null selection on popstate", () => {
    const h = fakeHistory();
    const dispose = installNavigation({ history: h.history, win: window });
    useDiscoveryStore.getState().selectHost("mac");
    popstate({ mode: "service", selection: null });
    expect(useDiscoveryStore.getState().selection).toBeNull();
    dispose();
  });

  it.each([
    { kind: "inst", id: "web" },
    { kind: "svc", id: "_http._tcp" },
    { kind: "ip", id: "10.0.0.2" },
  ] as const)("restores a $kind selection on popstate via the right dispatch", (selection) => {
    const h = fakeHistory();
    const dispose = installNavigation({ history: h.history, win: window });
    popstate({ mode: "service", selection });
    // A mis-wired dispatch (e.g. svc -> selectInst) would leave a different kind here.
    expect(useDiscoveryStore.getState().selection).toEqual(selection);
    dispose();
  });

  it("expands the service group when a svc selection is restored on popstate", () => {
    const h = fakeHistory();
    const dispose = installNavigation({ history: h.history, win: window });
    popstate({ mode: "service", selection: { kind: "svc", id: "_http._tcp" } });
    expect(useDiscoveryStore.getState().expanded.has("svc:_http._tcp")).toBe(true);
    dispose();
  });

  it("updates the baseline on apply so a matching user change does not re-push", () => {
    const h = fakeHistory();
    const dispose = installNavigation({ history: h.history, win: window });
    useSettingsStore.getState().setMode("host"); // one push
    expect(h.pushed).toHaveLength(1);
    popstate({ mode: "ip", selection: null }); // applies mode=ip; baseline becomes { ip, null }
    useSettingsStore.getState().setMode("ip"); // same as just-applied location
    expect(h.pushed).toHaveLength(1); // baseline was updated on apply -> no spurious push
    dispose();
  });

  it("stops pushing after dispose", () => {
    const h = fakeHistory();
    const dispose = installNavigation({ history: h.history, win: window });
    dispose();
    useSettingsStore.getState().setMode("all");
    expect(h.pushed).toEqual([]);
  });
});
