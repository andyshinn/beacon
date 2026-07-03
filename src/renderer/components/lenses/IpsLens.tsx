import { copyText } from "../../lib/commands";
import { Copy } from "../../lib/icons";
import type { IpGroup } from "../../lib/selectors";
import { useDiscoveryStore } from "../../store/discoveryStore";
import styles from "./Ips.module.css";

export function IpsLens({ groups }: { groups: IpGroup[] }) {
  const selectIp = useDiscoveryStore((s) => s.selectIp);
  return (
    <>
      {groups.map((g) => (
        <div key={g.family} className={styles.group}>
          <div className={styles.groupHeader}>
            <span className={styles.swatch} data-family={g.family} />
            <span className={styles.groupLabel}>{g.label}</span>
            <span className={styles.groupCount}>{g.count}</span>
          </div>
          {g.addresses.map((a) => (
            <button
              key={a.id}
              type="button"
              className={styles.row}
              data-selected={a.selected || undefined}
              onClick={() => selectIp(a.id)}
            >
              <span className={styles.col}>
                <span className={styles.ip}>{a.ip}</span>
                <span className={styles.host}>{a.hostName}</span>
              </span>
              {a.ports.length > 0 && (
                <span className={styles.ports}>
                  {a.ports.map((p) => (
                    <span key={p} className={styles.portChip}>
                      {p}
                    </span>
                  ))}
                </span>
              )}
              {/* biome-ignore lint/a11y/useSemanticElements: nested <button> inside <button> is invalid HTML; span role="button" is intentional */}
              <span
                className={styles.copy}
                role="button"
                aria-label="Copy address"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  void copyText(a.ip, a.ip);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    void copyText(a.ip, a.ip);
                  }
                }}
              >
                <Copy />
              </span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}
