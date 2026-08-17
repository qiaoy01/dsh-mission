// dsh-mission — persistent long-horizon autonomous mission runtime for the
// DeepSeek Harness. Main entry re-exports the service (default), the fold and
// validation primitives, the driver loop, and the host vocabulary.
// @module @deepseek-ai/dsh-mission
export { MissionService, default } from "./src/service.js";
export { MissionError } from "./src/domain.js";
export { effectiveTaskStatus, foldMission, matchesSpec, missionStatus } from "./src/fold.js";
export { isAcyclic, validateEvent } from "./src/validate.js";
export { driveMission, deterministicVerifier, isClaimable, pickClaimableTask, pickReadyTask } from "./src/driver.js";
export { llmDecider, llmReplanner, userApprovalGate } from "./src/llm.js";
export { subagentExecutor } from "./src/executor.js";
