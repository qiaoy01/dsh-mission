import type { Context } from '@deepseek-ai/cordis';
export declare const name = "mission-trigger";
/** No hard inject: `systemPrompt` and `commands` are optional in minimal compositions. */
export declare const inject: readonly string[];
/**
 * Install the trigger companion: a soft-guidance section and a `/mission`
 * command, each registered whenever its service exists in this scope and
 * re-registered via `internal/service` when the service appears later.
 */
export declare function apply(ctx: Context): void;
