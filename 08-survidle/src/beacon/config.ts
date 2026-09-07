import type { BeaconConfig } from "./datadog";

/**
 * The RUM application the beacon reports to. A client token is public
 * by design, so a constant is no leak; blank ids keep the beacon inert,
 * and the author fills them once the application exists in the org.
 */
export const BEACON: BeaconConfig = { applicationId: "20b21f6c-5231-4432-8814-c30955d3b3f2", clientToken: "pub3633358bc1952296d0ea1c3eb955cce6", site: "datadoghq.eu", service: "survidle", env: "pages" };
