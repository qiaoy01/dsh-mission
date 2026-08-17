import type { Context } from '@deepseek-ai/cordis';
import type { TaskExecutor } from './driver.ts';
/** One-shot subagent executor: dispatch each task to a child agent. */
export declare function subagentExecutor(ctx: Context, providerName?: string): TaskExecutor;
