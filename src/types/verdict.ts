import { SubmissionVerdict } from "../../generated/prisma";

export { SubmissionVerdict };

export const VERDICT_PRIORITY: readonly SubmissionVerdict[] = [
  SubmissionVerdict.COMPILE_ERROR,
  SubmissionVerdict.TIMEOUT,
  SubmissionVerdict.RUNTIME_ERROR,
  SubmissionVerdict.WRONG_ANSWER,
  SubmissionVerdict.ACCEPTED,
] as const;
