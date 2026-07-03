import { ScrollArea } from "@radix-ui/themes";
import { useMemo } from "react";
import { buildDetail, type DetailCtx } from "../lib/detail";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { AddressBlock, DetailHeader, EmptyDetail, HostsList, MetaTable, ServicesList, TxtSection } from "./detail/sections";

export function DetailPane() {
  const instances = useDiscoveryStore((s) => s.instances);
  const hosts = useDiscoveryStore((s) => s.hosts);
  const selection = useDiscoveryStore((s) => s.selection);
  const query = useDiscoveryStore((s) => s.query);
  const now = useDiscoveryStore((s) => s.now);
  const showDesc = useSettingsStore((s) => s.showDesc);
  const showV6 = useSettingsStore((s) => s.showV6);
  const showLinkLocal = useSettingsStore((s) => s.showLinkLocal);

  const detail = useMemo(() => {
    const ctx: DetailCtx = { instances, hosts, settings: { showDesc, showV6, showLinkLocal }, query, now };
    return buildDetail(selection, ctx);
  }, [instances, hosts, selection, query, now, showDesc, showV6, showLinkLocal]);

  if (!detail) return <EmptyDetail />;
  return (
    <>
      <DetailHeader detail={detail} />
      <ScrollArea className="bcn-scroll" type="hover" scrollbars="vertical" scrollHideDelay={500}>
        <div className="bcn-scroll-content" style={{ padding: "6px 20px 24px" }}>
          <AddressBlock title={detail.addrTitle} groups={detail.addrGroups} />
          <MetaTable rows={detail.meta} />
          <ServicesList title={detail.servicesTitle} rows={detail.services} />
          <HostsList title={detail.hostsTitle} rows={detail.hosts} />
          <TxtSection detail={detail} />
        </div>
      </ScrollArea>
    </>
  );
}
