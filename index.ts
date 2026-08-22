// dsh-mission — persistent long-horizon autonomous mission runtime for the
// DeepSeek Harness. Main entry re-exports the service (default), the fold and
// validation primitives, the driver loop, and the host vocabulary.
// @module @deepseek-ai/dsh-mission

export { MissionService, default } from './src/service.ts'
export type { MissionView, TaskView } from './src/service.ts'
export { MissionError } from './src/domain.ts'
export type {
  ClaimRequest,
  CreateMissionRequest,
  MissionErrorCode,
  PlanRequest,
  ReportRequest,
  VerifyRequest,
} from './src/domain.ts'
export { effectiveTaskStatus, foldMission, matchesSpec, missionStatus } from './src/fold.ts'
export { isAcyclic, validateEvent } from './src/validate.ts'
export { driveMission, deterministicVerifier, isClaimable, pickClaimableTask, pickReadyTask } from './src/driver.ts'
export type { DriveOptions, PlanProposal, ReplanApproval, TaskDecider, TaskExecutor, TaskOutcome, TaskReplanner, TaskVerifier, Verdict } from './src/driver.ts'
export { llmDecider, llmReplanner, userApprovalGate } from './src/llm.ts'
export type { LlmStrategyOptions } from './src/llm.ts'
export { subagentExecutor } from './src/executor.ts'
export type { MissionDriverConfig } from './src/driver-host.ts'
export type { MissionProjectionValue, MissionSummary, MissionTaskSummary } from './src/projection.ts'
export type * from './src/types.ts'
export type * from './src/domain.ts'
