import type { BeaconConfig } from "./datadog";

/**
 * The RUM application the beacon reports to. A client token is public
 * by design, so a constant is no leak; blank ids keep the beacon inert,
 * and the author fills them once the application exists in the org.
 */
export const BEACON: BeaconConfig = { applicationId: "", clientToken: "", site: "datadoghq.eu", service: "survidle", env: "pages" };
