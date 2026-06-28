export interface ServiceMeta {
	desc: string;
	proto: "tcp" | "udp";
}

// Static metadata for known mDNS service types (prototype SVC map). proto is also
// carried on each Instance; desc is UI-only and lives here.
export const SERVICE_META: Record<string, ServiceMeta> = {
	"_airplay._tcp": { desc: "Protocol for streaming of audio/video content", proto: "tcp" },
	"_raop._tcp": { desc: "Remote Audio Output Protocol — AirPlay audio", proto: "tcp" },
	"_companion-link._tcp": { desc: "Apple device companion linking", proto: "tcp" },
	"_coresense-ws._tcp": { desc: "Coresense WebSocket service", proto: "tcp" },
	"_device-info._tcp": { desc: "Device Info", proto: "tcp" },
	"_hap._tcp": { desc: "HomeKit Accessory Protocol", proto: "tcp" },
	"_home-assistant._tcp": { desc: "Home Assistant", proto: "tcp" },
	"_http._tcp": { desc: "World Wide Web HTTP", proto: "tcp" },
	"_hue._tcp": { desc: "Philips Hue protocol", proto: "tcp" },
	"_matter._tcp": { desc: "Matter Operational Discovery and Communication", proto: "tcp" },
	"_meshcop._udp": { desc: "Thread Mesh Commissioning", proto: "udp" },
	"_meshcore._tcp": { desc: "MeshCore networking", proto: "tcp" },
	"_ssh._tcp": { desc: "SSH Remote Login", proto: "tcp" },
	"_prusalink._tcp": { desc: "PrusaLink 3D printer", proto: "tcp" },
	"_spotify-connect._tcp": { desc: "Spotify Connect", proto: "tcp" },
};

export function serviceMeta(type: string): ServiceMeta {
	return SERVICE_META[type] ?? { desc: "", proto: "tcp" };
}

export const INSTANCE_WEB_TYPES = new Set(["_http._tcp", "_hue._tcp", "_prusalink._tcp", "_home-assistant._tcp"]);
export const HOST_WEB_TYPES = new Set(["_http._tcp", "_home-assistant._tcp"]);

export function webScheme(type: string): "http" | "https" {
	return type === "_hue._tcp" ? "https" : "http";
}

export function webUrl(type: string, ip: string | null, port: number): string | null {
	if (!ip) return null;
	return `${webScheme(type)}://${ip}${port > 0 ? `:${port}` : ""}`;
}
