import type { Address, AddrFamily } from "../../shared/types";

export function classifyAddress(ip: string): Address {
	const pct = ip.indexOf("%");
	const zone = pct >= 0 ? ip.slice(pct + 1) : undefined;
	const value = pct >= 0 ? ip.slice(0, pct) : ip;
	const family = familyOf(value);
	return zone ? { value, family, zone } : { value, family };
}

function familyOf(value: string): AddrFamily {
	if (value.includes(":")) {
		const lower = value.toLowerCase();
		if (lower === "::1") return "loopback";
		if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb"))
			return "linklocal"; // fe80::/10
		return "ipv6";
	}
	if (value.startsWith("127.")) return "loopback";
	if (value.startsWith("169.254.")) return "linklocal";
	return "ipv4";
}
