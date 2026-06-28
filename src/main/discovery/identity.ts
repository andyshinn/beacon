function normalizeDot(name: string): string {
	return name.endsWith(".") ? name : name + ".";
}

export function instanceKey(fqdn: string): string {
	return normalizeDot(fqdn).toLowerCase();
}

export function hostId(hostname: string): string {
	return normalizeDot(hostname).toLowerCase();
}

export function cleanHostname(hostname: string): string {
	return hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
}

const INSTANCE_RE = /^(.+)\.(_[^.]+)\.(_(tcp|udp))\.(.+\.?)$/;

export function parseInstanceName(
	fqdn: string,
): { instance: string; serviceType: string; protocol: "tcp" | "udp"; domain: string } | null {
	const m = INSTANCE_RE.exec(normalizeDot(fqdn));
	if (!m) return null;
	const [, instance, app, proto, protocol, domain] = m;
	return {
		instance: instance!,
		serviceType: `${app}.${proto}`,
		protocol: protocol as "tcp" | "udp",
		domain: domain!,
	};
}
