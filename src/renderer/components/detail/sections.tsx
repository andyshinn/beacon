import { Button } from "@radix-ui/themes";
import { copyText, revealHost, runDetailAction } from "../../lib/commands";
import type {
	AdvertisedHost,
	DetailAction,
	DetailAddrGroup,
	DetailModel,
	MetaRow,
	ServiceRow,
	TxtRow,
} from "../../lib/detail";
import {
	ChevronRight,
	Copy,
	ExtLink,
	ModeHost,
	ModeInstance,
	ModeIp,
	ModeService,
	Radar,
	Resolve,
	RevealHost,
} from "../../lib/icons";
import { useDiscoveryStore } from "../../store/discoveryStore";
import styles from "./Detail.module.css";

const KIND_ICON = { instance: ModeInstance, host: ModeHost, service: ModeService, ip: ModeIp };
const ACTION_ICON = { ext: ExtLink, copy: Copy, resolve: Resolve, reveal: RevealHost };

export function EmptyDetail() {
	return (
		<div className={styles.empty}>
			<Radar />
			<span>Select an item to see details</span>
		</div>
	);
}

function ActionButtons({ actions }: { actions: DetailAction[] }) {
	if (actions.length === 0) return null;
	return (
		<div className={styles.actions}>
			{actions.map((a) => {
				const Icon = ACTION_ICON[a.icon];
				return (
					<Button
						key={a.id}
						size="2"
						variant={a.primary ? "solid" : "soft"}
						color={a.primary ? "indigo" : "gray"}
						onClick={() => runDetailAction(a)}
					>
						<Icon />
						{a.label}
					</Button>
				);
			})}
		</div>
	);
}

export function DetailHeader({ detail }: { detail: DetailModel }) {
	const Icon = KIND_ICON[detail.kind];
	return (
		<div className={styles.header}>
			<div className={styles.headRow}>
				<span className={styles.iconTile}>
					<Icon size={19} />
				</span>
				<span className={styles.nameWrap}>
					<span className={detail.nameMono ? styles.nameMono : styles.name}>{detail.name}</span>
					{detail.status &&
						(detail.status.live ? (
							<span className={styles.statusLive}>
								<span className={styles.statusDot} />
								{detail.status.label}
							</span>
						) : (
							<span className={styles.statusOff}>{detail.status.label}</span>
						))}
				</span>
			</div>
			{detail.sub && <div className={styles.sub}>{detail.sub}</div>}
			{detail.serviceDesc && <div className={styles.serviceDesc}>{detail.serviceDesc}</div>}
			<ActionButtons actions={detail.actions} />
		</div>
	);
}

export function AddressBlock({ title, groups }: { title?: string; groups: DetailAddrGroup[] }) {
	if (groups.length === 0) return null;
	return (
		<section className={styles.section}>
			<div className={styles.sectionLabel}>{title}</div>
			{groups.map((g) => (
				<div key={g.family} className={styles.addrGroup}>
					<div className={styles.addrGroupHead}>
						<span className={styles.swatch} data-family={g.family} />
						{g.label}
					</div>
					{g.addresses.map((a) => (
						<button
							key={a.copyValue}
							type="button"
							className={styles.addrRow}
							onClick={() => void copyText(a.copyValue, a.copyValue)}
						>
							<span className={styles.addrIp}>
								{a.ip}
								{a.endpoint && <span className={styles.addrPort}>{a.portText}</span>}
							</span>
							<Copy />
						</button>
					))}
				</div>
			))}
		</section>
	);
}

export function MetaTable({ rows }: { rows: MetaRow[] }) {
	if (rows.length === 0) return null;
	return (
		<section className={styles.section}>
			<div className={styles.sectionLabel}>Details</div>
			<div className={styles.metaTable}>
				{rows.map((m) => (
					<div key={m.label} className={styles.metaRow}>
						<span className={styles.metaKey}>{m.label}</span>
						{m.link ? (
							<button type="button" className={styles.metaLink} onClick={() => revealHost(m.link?.hostId ?? "")}>
								{m.value}
							</button>
						) : (
							<span className={m.font === "mono" ? styles.metaValMono : styles.metaVal}>{m.value}</span>
						)}
						{m.copyable && (
							// biome-ignore lint/a11y/useSemanticElements: copy button is nested inside a non-button row div; using role=button span avoids invalid nested-button HTML
							<span
								className={styles.metaCopy}
								role="button"
								aria-label={`Copy ${m.label}`}
								tabIndex={0}
								onClick={() => void copyText(m.value, m.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										void copyText(m.value, m.value);
									}
								}}
							>
								<Copy />
							</span>
						)}
					</div>
				))}
			</div>
		</section>
	);
}

export function ServicesList({ title, rows }: { title?: string; rows: ServiceRow[] }) {
	if (!title || rows.length === 0) return null;
	return (
		<CardList
			title={title}
			rows={rows.map((r) => ({ id: r.id, title: r.title, sub: r.subtitle, port: r.port, mono: true }))}
		/>
	);
}

export function HostsList({ title, rows }: { title?: string; rows: AdvertisedHost[] }) {
	if (!title || rows.length === 0) return null;
	return (
		<section className={styles.section}>
			<div className={styles.sectionLabel}>{title}</div>
			{rows.map((hrow) => (
				<button
					key={hrow.id}
					type="button"
					className={styles.card}
					onClick={() => useDiscoveryStore.getState().selectInst(hrow.id)}
				>
					<span className={styles.cardCol}>
						<span className={styles.cardTitle}>{hrow.name}</span>
						<span className={styles.cardSubMono}>{hrow.sub}</span>
					</span>
					{hrow.chip && <span className={styles.accentChip}>{hrow.chip}</span>}
				</button>
			))}
		</section>
	);
}

function CardList({
	title,
	rows,
}: {
	title: string;
	rows: { id: string; title: string; sub?: string; port: number; mono: boolean }[];
}) {
	return (
		<section className={styles.section}>
			<div className={styles.sectionLabel}>{title}</div>
			{rows.map((r) => (
				<button
					key={r.id}
					type="button"
					className={styles.card}
					onClick={() => useDiscoveryStore.getState().selectInst(r.id)}
				>
					<span className={styles.cardCol}>
						<span className={r.mono ? styles.cardTitleMono : styles.cardTitle}>{r.title}</span>
						{r.sub && <span className={styles.cardSub}>{r.sub}</span>}
					</span>
					{r.port > 0 && <span className={styles.cardPort}>:{r.port}</span>}
					<ChevronRight />
				</button>
			))}
		</section>
	);
}

export function TxtSection({ detail }: { detail: DetailModel }) {
	if (detail.noTxt) return <div className={styles.noTxt}>No TXT records advertised</div>;
	if (!detail.hasTxt) return null;
	return (
		<section className={styles.section}>
			<div className={styles.txtHead}>
				<span className={styles.sectionLabel}>TXT Records</span>
				<span className={styles.txtCount}>{detail.txtTitle}</span>
			</div>
			<div className={styles.txtTable}>
				{detail.txt.map((t: TxtRow) => (
					<div key={t.key} className={styles.txtRow}>
						<span className={styles.txtKey}>{t.key}</span>
						<span className={styles.txtVal}>{t.value}</span>
						{/* biome-ignore lint/a11y/useSemanticElements: copy button is nested inside a non-button row div; using role=button span avoids invalid nested-button HTML */}
						<span
							className={styles.metaCopy}
							role="button"
							aria-label={`Copy ${t.key}`}
							tabIndex={0}
							onClick={() => void copyText(`${t.key}=${t.value}`, `${t.key}=${t.value}`)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									void copyText(`${t.key}=${t.value}`, `${t.key}=${t.value}`);
								}
							}}
						>
							<Copy />
						</span>
					</div>
				))}
			</div>
		</section>
	);
}
