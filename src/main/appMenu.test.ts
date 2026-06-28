import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { buildMenuTemplate, type MenuBuildDeps, type MenuState } from "./appMenu";

type Tmpl = MenuItemConstructorOptions[];

function deps(over: Partial<MenuBuildDeps> = {}): MenuBuildDeps {
	return { platform: "darwin", appName: "Beacon", onCommand: vi.fn(), onBack: vi.fn(), onForward: vi.fn(), ...over };
}
const base: MenuState = { live: true, viewMode: "service", canGoBack: false, canGoForward: false };

function menu(t: Tmpl, label: string): MenuItemConstructorOptions | undefined {
	return t.find((m) => m.label === label);
}
function sub(t: Tmpl, label: string): MenuItemConstructorOptions[] {
	return (menu(t, label)?.submenu ?? []) as MenuItemConstructorOptions[];
}
function item(t: Tmpl, menuLabel: string, itemLabel: string): MenuItemConstructorOptions | undefined {
	return sub(t, menuLabel).find((i) => i.label === itemLabel);
}

describe("buildMenuTemplate", () => {
	it("flips the Pause/Resume label with live state", () => {
		expect(item(buildMenuTemplate({ ...base, live: true }, deps()), "Discovery", "Pause Discovery")).toBeDefined();
		expect(item(buildMenuTemplate({ ...base, live: false }, deps()), "Discovery", "Resume Discovery")).toBeDefined();
	});

	it("checks exactly the active view item", () => {
		const t = buildMenuTemplate({ ...base, viewMode: "host" }, deps());
		expect(item(t, "View", "Hosts")?.checked).toBe(true);
		expect(item(t, "View", "Services")?.checked).toBe(false);
		expect(item(t, "View", "IPs")?.checked).toBe(false);
		expect(item(t, "View", "All")?.checked).toBe(false);
	});

	it("enables Back/Forward per nav state", () => {
		const off = buildMenuTemplate(base, deps());
		expect(item(off, "History", "Back")?.enabled).toBe(false);
		expect(item(off, "History", "Forward")?.enabled).toBe(false);
		const on = buildMenuTemplate({ ...base, canGoBack: true, canGoForward: true }, deps());
		expect(item(on, "History", "Back")?.enabled).toBe(true);
		expect(item(on, "History", "Forward")?.enabled).toBe(true);
	});

	it("routes command clicks to onCommand", () => {
		const d = deps();
		const t = buildMenuTemplate(base, d);
		(item(t, "View", "Hosts")?.click as () => void)();
		expect(d.onCommand).toHaveBeenCalledWith("view:host");
		(item(t, "Discovery", "Rescan")?.click as () => void)();
		expect(d.onCommand).toHaveBeenCalledWith("rescan");
		(item(t, "Discovery", "Pause Discovery")?.click as () => void)();
		expect(d.onCommand).toHaveBeenCalledWith("toggleLive");
		(item(t, "Edit", "Find")?.click as () => void)();
		expect(d.onCommand).toHaveBeenCalledWith("focusSearch");
		(item(t, "File", "Export as JSON")?.click as () => void)();
		expect(d.onCommand).toHaveBeenCalledWith("export:json");
		(item(t, "File", "Copy as Text")?.click as () => void)();
		expect(d.onCommand).toHaveBeenCalledWith("export:txt");
	});

	it("routes Back/Forward clicks to their deps", () => {
		const d = deps();
		const t = buildMenuTemplate({ ...base, canGoBack: true, canGoForward: true }, d);
		(item(t, "History", "Back")?.click as () => void)();
		(item(t, "History", "Forward")?.click as () => void)();
		expect(d.onBack).toHaveBeenCalledTimes(1);
		expect(d.onForward).toHaveBeenCalledTimes(1);
	});

	it("assigns conventional accelerators", () => {
		const t = buildMenuTemplate(base, deps());
		expect(item(t, "Discovery", "Rescan")?.accelerator).toBe("CommandOrControl+R");
		expect(item(t, "Edit", "Find")?.accelerator).toBe("CommandOrControl+F");
		expect(item(t, "View", "Services")?.accelerator).toBe("CommandOrControl+1");
		expect(item(t, "View", "All")?.accelerator).toBe("CommandOrControl+4");
		expect(item(t, "History", "Back")?.accelerator).toBe("CommandOrControl+[");
		expect(item(t, "History", "Forward")?.accelerator).toBe("CommandOrControl+]");
	});

	it("puts the app menu first on macOS with the Local Network item", () => {
		const t = buildMenuTemplate(base, deps({ platform: "darwin" }));
		expect(t[0]?.label).toBe("Beacon");
		expect(item(t, "Beacon", "Open Local Network Settings…")).toBeDefined();
	});

	it("omits the app menu and the Local Network item off macOS", () => {
		const t = buildMenuTemplate(base, deps({ platform: "win32" }));
		expect(t[0]?.label).toBe("File");
		expect(t.some((m) => m.label === "Beacon")).toBe(false);
		const everyItem = t.flatMap((m) => (m.submenu ?? []) as MenuItemConstructorOptions[]);
		expect(everyItem.some((i) => i.label === "Open Local Network Settings…")).toBe(false);
	});
});
