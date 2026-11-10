import { DropdownMenu, IconButton, Tooltip } from "@radix-ui/themes";
import { useResolvedAppearance } from "../lib/appearance";
import { Moon, Sun } from "../lib/icons";
import { type Appearance, useSettingsStore } from "../store/settingsStore";

const OPTIONS: { value: Appearance; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function AppearanceMenu({ defaultOpen }: { defaultOpen?: boolean } = {}) {
  const appearance = useSettingsStore((s) => s.appearance);
  const setAppearance = useSettingsStore((s) => s.setAppearance);
  const resolved = useResolvedAppearance();
  // The icon shows the theme on screen; the label also says when the OS is choosing it.
  const current = appearance === "system" ? `System (${resolved})` : resolved === "dark" ? "Dark" : "Light";
  const label = `Appearance: ${current}`;
  return (
    <DropdownMenu.Root defaultOpen={defaultOpen}>
      <Tooltip content={label}>
        <DropdownMenu.Trigger>
          <IconButton variant="ghost" size="2" aria-label={label} data-appearance={resolved}>
            {resolved === "dark" ? <Moon /> : <Sun />}
          </IconButton>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Content>
        <DropdownMenu.Label>Appearance</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={appearance} onValueChange={(v) => setAppearance(v as Appearance)}>
          {OPTIONS.map((o) => (
            <DropdownMenu.RadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenu.RadioItem>
          ))}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
