import { DiscoveryManager, type ManagerEvent } from "../src/main/discovery/DiscoveryManager";
import { BonjourSource } from "../src/main/discovery/sources/BonjourSource";

const source = new BonjourSource();
const manager = new DiscoveryManager({
  source,
  onEvent(e: ManagerEvent) {
    if (e.type === "snapshot") {
      console.log(`[snapshot] ${e.snapshot.hosts.length} hosts, ${e.snapshot.instances.length} instances`);
    } else if (e.type === "status") {
      console.log(`[status] live=${e.status.live} scanning=${e.status.scanning}`);
    } else if (e.type === "health") {
      console.log(`[health] warning=${e.health.warning}`);
    } else {
      const d = e.delta;
      for (const i of d.upsertInstances ?? [])
        console.log(`  + ${i.serviceType.padEnd(22)} ${i.name}  @ ${i.hostId} :${i.port}`);
      for (const k of d.removeInstanceKeys ?? []) console.log(`  - ${k}`);
    }
  },
});

console.log("Browsing for mDNS services… (Ctrl+C to stop)");
manager.start();
process.on("SIGINT", () => {
  manager.stop();
  process.exit(0);
});
