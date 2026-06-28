import type { JSX } from "react";

type IconProps = { size?: number; className?: string };

// PauseBars — Beacon.dc.html:86
export function PauseBars({ size = 11, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 11 11" className={className} aria-hidden={true}>
			<rect x="2.4" y="2" width="2.2" height="7" rx="1" fill="currentColor" />
			<rect x="6.4" y="2" width="2.2" height="7" rx="1" fill="currentColor" />
		</svg>
	);
}

// PlayTriangle — Beacon.dc.html:87
export function PlayTriangle({ size = 11, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 11 11" className={className} aria-hidden={true}>
			<path d="M3 2.2L9 5.5L3 8.8Z" fill="currentColor" />
		</svg>
	);
}

// Search — Beacon.dc.html:105
export function Search({ size = 14, className }: IconProps): JSX.Element {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 14 14"
			fill="none"
			stroke="currentColor"
			className={className}
			aria-hidden={true}
		>
			<circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.4" />
			<path d="M9.2 9.2L12.2 12.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
		</svg>
	);
}

// ClearX — Beacon.dc.html:108
export function ClearX({ size = 13, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 13 13" className={className} aria-hidden={true}>
			<path d="M3.5 3.5L9.5 9.5M9.5 3.5L3.5 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
		</svg>
	);
}

// Refresh — Beacon.dc.html:114-115
export function Refresh({ size = 15, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 15 15" fill="none" className={className} aria-hidden={true}>
			<path d="M13 7.5a5.5 5.5 0 1 1-1.7-3.97" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
			<path d="M13 2.2V5.2H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

// ViewOptions — Beacon.dc.html:121
export function ViewOptions({ size = 15, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 15 15" fill="none" className={className} aria-hidden={true}>
			<path d="M2 4.5h11M2 10.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
			<circle cx="9.5" cy="4.5" r="1.9" fill="var(--toolbar)" stroke="currentColor" strokeWidth="1.4" />
			<circle cx="5.5" cy="10.5" r="1.9" fill="var(--toolbar)" stroke="currentColor" strokeWidth="1.4" />
		</svg>
	);
}

// Check — Beacon.dc.html:128
export function Check({ size = 13, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 13 13" className={className} aria-hidden={true}>
			<path
				d="M2.5 7L5 9.5L10.5 3.5"
				stroke="currentColor"
				strokeWidth="1.6"
				fill="none"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

// Sun — Beacon.dc.html:149
export function Sun({ size = 15, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 15 15" fill="none" className={className} aria-hidden={true}>
			<circle cx="7.5" cy="7.5" r="3" stroke="currentColor" strokeWidth="1.4" />
			<path
				d="M7.5 1v1.6M7.5 12.4V14M14 7.5h-1.6M2.6 7.5H1M12.1 2.9l-1.1 1.1M4 11l-1.1 1.1M12.1 12.1L11 11M4 4L2.9 2.9"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
			/>
		</svg>
	);
}

// Moon — Beacon.dc.html:150
export function Moon({ size = 15, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 15 15" fill="none" className={className} aria-hidden={true}>
			<path
				d="M12.8 9.3A5.5 5.5 0 1 1 5.7 2.2a4.3 4.3 0 0 0 7.1 7.1Z"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

// Download — Beacon.dc.html:156
export function Download({ size = 13, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 13 13" fill="none" className={className} aria-hidden={true}>
			<path
				d="M6.5 1.5v6M4 5.2l2.5 2.5L9 5.2"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path d="M2.5 10.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
		</svg>
	);
}

// ModeService — Beacon.dc.html:197
export function ModeService({ size = 16, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden={true}>
			<rect x="2" y="2.5" width="12" height="3.2" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
			<rect x="2" y="7.4" width="12" height="3.2" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
			<circle cx="4.4" cy="4.1" r=".8" fill="currentColor" />
			<circle cx="4.4" cy="9" r=".8" fill="currentColor" />
		</svg>
	);
}

// ModeHost — Beacon.dc.html:198
export function ModeHost({ size = 16, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden={true}>
			<rect x="2" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
			<path d="M6 13.5h4M8 11v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

// ModeIp — Beacon.dc.html:199
export function ModeIp({ size = 16, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden={true}>
			<circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
			<path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" stroke="currentColor" strokeWidth="1.1" />
		</svg>
	);
}

// ModeAll — Beacon.dc.html:200
export function ModeAll({ size = 16, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden={true}>
			<path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
			<circle cx="2.6" cy="4" r="1.1" fill="currentColor" />
			<circle cx="2.6" cy="8" r="1.1" fill="currentColor" />
			<circle cx="2.6" cy="12" r="1.1" fill="currentColor" />
		</svg>
	);
}

// ExpandAll — Beacon.dc.html:228
export function ExpandAll({ size = 14, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 14 14" fill="none" className={className} aria-hidden={true}>
			<path d="M4.5 5.5L7 8L9.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M2.5 2.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
		</svg>
	);
}

// CollapseAll — Beacon.dc.html:229
export function CollapseAll({ size = 14, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 14 14" fill="none" className={className} aria-hidden={true}>
			<path d="M4.5 8L7 5.5L9.5 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M2.5 11.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
		</svg>
	);
}

// DisclosureDown — Beacon.dc.html:242
export function DisclosureDown({ size = 11, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 11 11" fill="none" className={className} aria-hidden={true}>
			<path d="M2.5 4L5.5 7L8.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

// DisclosureRight — Beacon.dc.html:243
export function DisclosureRight({ size = 11, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 11 11" fill="none" className={className} aria-hidden={true}>
			<path d="M4 2.5L7 5.5L4 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

// Copy — Beacon.dc.html:296
export function Copy({ size = 13, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 13 13" fill="none" className={className} aria-hidden={true}>
			<rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
			<path d="M8.5 4.5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v4.5a1 1 0 0 0 1 1h1.5" stroke="currentColor" strokeWidth="1.2" />
		</svg>
	);
}

// ModeInstance — Beacon.dc.html:341
export function ModeInstance({ size = 16, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden={true}>
			<path d="M3 6l5-3 5 3v4l-5 3-5-3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
			<path d="M8 8v5M3 6l5 2 5-2" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
		</svg>
	);
}

// ChevronRight — Beacon.dc.html:429
export function ChevronRight({ size = 12, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 12 12" fill="none" className={className} aria-hidden={true}>
			<path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

// Radar — Beacon.dc.html:329
export function Radar({ size = 40, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className} aria-hidden={true}>
			<circle cx="20" cy="20" r="4" stroke="currentColor" strokeWidth="1.6" />
			<circle cx="20" cy="20" r="10" stroke="currentColor" strokeWidth="1.4" opacity=".6" />
			<circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="1.2" opacity=".3" />
		</svg>
	);
}

// ToastCheck — Beacon.dc.html:501
export function ToastCheck({ size = 14, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 14 14" fill="none" className={className} aria-hidden={true}>
			<path
				d="M2.5 7.5L5.5 10.5L11.5 3.5"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

// ExtLink — Beacon.dc.html:719 (extIcon in JS)
export function ExtLink({ size = 13, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 13 13" fill="none" className={className} aria-hidden={true}>
			<path d="M5 2.5H2.5v8h8V8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
			<path
				d="M7.5 2.5h3v3M10.5 2.5L6 7"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

// RevealHost — Beacon.dc.html:720 (revealIcon in JS)
export function RevealHost({ size = 13, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 13 13" fill="none" className={className} aria-hidden={true}>
			<rect x="2" y="2.5" width="9" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
			<path d="M4.5 10.5h4M6.5 8.5v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
		</svg>
	);
}

// Resolve — Beacon.dc.html:721 (resolveIcon in JS)
export function Resolve({ size = 13, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 13 13" fill="none" className={className} aria-hidden={true}>
			<path d="M11 6.5A4.5 4.5 0 1 1 9.6 3.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
			<path d="M11 1.8V4H8.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}
