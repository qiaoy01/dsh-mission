import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "mission-invariant";
/** No hard inject: the `invariants` service exists only in dev/test compositions. */
export declare const inject: readonly string[];
/**
 * Register the mission-stream invariant companion whenever the `invariants`
 * service is available in this scope. Registration is idempotent; the
 * `internal/service` listener re-registers after a service removal cycle
 * (e.g. an HMR reload of the registry row).
 * @param ctx - Cordis context carrying the optional invariant service.
 */
export declare function apply(ctx: Context): void;
