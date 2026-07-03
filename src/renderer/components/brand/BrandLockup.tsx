import { useId } from "react";
import styles from "./BrandLockup.module.css";
import { BEACON_MARK_PATH, BEACON_WORDMARK_PATH } from "./glyphs";

/** The containerised app-icon mark: the white "b" + beacon core on the indigo
 *  gradient squircle. Self-coloured (its own gradient), so it reads on any
 *  toolbar background. A per-instance gradient id avoids collisions. */
export function BeaconMark({ size = 20 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6e82ee" />
          <stop offset="0.5" stopColor="#3e63dd" />
          <stop offset="1" stopColor="#2b46b8" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="230" fill={`url(#${id})`} />
      <g transform="translate(284,202) scale(0.62)">
        <path fillRule="evenodd" fill="#fff" d={BEACON_MARK_PATH} />
      </g>
      <circle cx="513" cy="595" r="65" fill="#fff" />
    </svg>
  );
}

/** The "beacon" wordmark logotype. Uses currentColor so it inherits the
 *  surrounding text colour and adapts to the light/dark appearance toggle. */
export function BeaconWordmark({ height = 13 }: { height?: number }) {
  return (
    <svg
      height={height}
      viewBox="0 0 4799 1000"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
    >
      <path fill="currentColor" d={BEACON_WORDMARK_PATH} />
    </svg>
  );
}

/** Title-bar brand lockup: mark + wordmark, exposed to assistive tech as a
 *  single "Beacon" image. */
export function BeaconLockup() {
  return (
    <span className={styles.lockup} role="img" aria-label="Beacon" title="mDNS / Bonjour browser">
      <BeaconMark size={20} />
      <BeaconWordmark height={13} />
    </span>
  );
}
