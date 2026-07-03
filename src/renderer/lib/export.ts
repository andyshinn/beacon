import type { Host, Instance } from "../../shared/types";
import { primaryIp } from "./presence";

interface ExportRow {
  name: string;
  serviceType: string;
  protocol: string;
  port: number;
  host: string;
  hostname: string;
  primaryIp: string | null;
  addresses: string[];
  present: boolean;
  txt: Record<string, string>;
}

function toRows(instances: Instance[], hosts: Map<string, Host>): ExportRow[] {
  return instances.map((i) => {
    const h = hosts.get(i.hostId);
    return {
      name: i.name,
      serviceType: i.serviceType,
      protocol: i.protocol,
      port: i.port,
      host: h?.displayName ?? "",
      hostname: h?.hostname ?? "",
      primaryIp: primaryIp(h),
      addresses: (h?.addresses ?? []).map((a) => a.value),
      present: i.present,
      txt: i.txt,
    };
  });
}

export function toJSON(instances: Instance[], hosts: Map<string, Host>): string {
  return JSON.stringify(toRows(instances, hosts), null, 2);
}

const COLUMNS = [
  "name",
  "serviceType",
  "protocol",
  "port",
  "host",
  "hostname",
  "primaryIp",
  "addresses",
  "present",
  "txt",
] as const;

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

export function toCSV(instances: Instance[], hosts: Map<string, Host>): string {
  const header = COLUMNS.join(",");
  const lines = toRows(instances, hosts).map((r) =>
    [
      r.name,
      r.serviceType,
      r.protocol,
      String(r.port),
      r.host,
      r.hostname,
      r.primaryIp ?? "",
      r.addresses.join(";"),
      String(r.present),
      Object.entries(r.txt)
        .map(([k, v]) => `${k}=${v}`)
        .join(";"),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header, ...lines].join("\n");
}

export function toText(instances: Instance[], hosts: Map<string, Host>): string {
  return toRows(instances, hosts)
    .map((r) => `${r.name}  ${r.serviceType}  ${r.primaryIp ?? "—"}${r.port > 0 ? `:${r.port}` : ""}`)
    .join("\n");
}

export function triggerDownload(filename: string, mime: string, text: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
