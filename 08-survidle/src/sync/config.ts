/**
 * Where the sync store lives. A Worker URL is public by design, so a
 * constant is no leak; a blank one keeps the sync inert - the settings
 * block says "not configured" and nothing is fetched - until the author
 * has run `npm run worker:deploy` once and pasted the workers.dev URL the
 * deploy prints here. Development talks to `wrangler dev` on 8787 instead,
 * and `VITE_SYNC_URL` in the environment overrides both.
 */
export const SYNC_URL: string = import.meta.env.VITE_SYNC_URL || (import.meta.env.DEV ? "http://127.0.0.1:8787" : "");

/** A save the store refuses above this; a save that approaches it is a bug to trace, never a reason to raise the cap. */
export const SAVE_CAP_BYTES = 1_048_576;
