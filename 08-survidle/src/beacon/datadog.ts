/**
 * The one file that names the vendor. The SDK is a dynamic import so the
 * page never waits for it; emits queue until it is ready and drain in
 * order. Replay, user interactions, resources and long tasks are off and
 * the privacy level masks everything: a game screen has nothing worth
 * recording beyond the actions the beacon sends on purpose.
 */
import type { Sink } from "./beacon";

export interface BeaconConfig { applicationId: string; clientToken: string; site: string; service: string; env: string }

/** The four calls the sink makes, so a test can stand in for the SDK. */
export interface RumLike {
  init(options: Record<string, unknown>): void;
  setUser(user: { id: string }): void;
  setGlobalContextProperty(key: string, value: unknown): void;
  addAction(name: string, context?: Record<string, unknown>): void;
}

const loadSdk = (): Promise<{ datadogRum: RumLike }> => import("@datadog/browser-rum") as unknown as Promise<{ datadogRum: RumLike }>;

export function createDatadogSink(config: BeaconConfig, userId: string, global: Record<string, unknown>, load: () => Promise<{ datadogRum: RumLike }> = loadSdk): Sink {
  let rum: RumLike | null = null;
  let queue: [string, Record<string, unknown>][] | null = [];
  load().then(({ datadogRum }) => {
    datadogRum.init({
      applicationId: config.applicationId, clientToken: config.clientToken, site: config.site, service: config.service, env: config.env,
      sessionSampleRate: 100, sessionReplaySampleRate: 0, trackUserInteractions: false, trackResources: false, trackLongTasks: false, defaultPrivacyLevel: "mask",
    });
    datadogRum.setUser({ id: userId });
    for (const [k, v] of Object.entries(global)) datadogRum.setGlobalContextProperty(k, v);
    rum = datadogRum;
    for (const [name, ctx] of queue ?? []) rum.addAction(name, ctx);
    queue = null;
  }).catch((err) => {
    queue = null;
    console.warn("beacon: the SDK did not load, nothing is sent", err);
  });
  return {
    emit(name, ctx) {
      if (rum) rum.addAction(name, ctx);
      else queue?.push([name, ctx]);
    },
  };
}
