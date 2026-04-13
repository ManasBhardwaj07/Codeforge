import { SubmissionVerdict } from "../../generated/prisma";
import { prisma } from "@/lib/prisma";

export type SubmissionEvaluation = {
  verdict: SubmissionVerdict;
  totalTests: number;
  passedTests: number;
  failedTests: number;
};

type PersistedErrorType = "COMPILE_ERROR" | "TIMEOUT" | "RUNTIME_ERROR" | "INFRA_ERROR" | null;

function parsePersistedErrorType(stderr: string | null): PersistedErrorType {
  if (!stderr) {
    return null;
  }

  const match = stderr.match(/^\[(COMPILE_ERROR|TIMEOUT|RUNTIME_ERROR|INFRA_ERROR)\]/);
  if (!match) {
    return null;
  }

  return match[1] as PersistedErrorType;
}

export async function evaluateSubmission(submissionId: string): Promise<SubmissionEvaluation> {
  const results = await prisma.executionResult.findMany({
    where: {
      submissionId,
    },
    select: {
      passed: true,
      stderr: true,
    },
  });

  if (results.length === 0) {
    throw new Error(`Submission ${submissionId} has no execution results to evaluate`);
  }

  const totalTests = results.length;
  const passedTests = results.filter((result) => result.passed).length;
  const failedTests = totalTests - passedTests;
  const failedErrorTypes = results
    .filter((result) => !result.passed)
    .map((result) => parsePersistedErrorType(result.stderr));

  let verdict: SubmissionVerdict = SubmissionVerdict.ACCEPTED;

  if (failedErrorTypes.includes("COMPILE_ERROR")) {
    verdict = SubmissionVerdict.COMPILE_ERROR;
  } else if (failedErrorTypes.includes("TIMEOUT")) {
    verdict = SubmissionVerdict.TIMEOUT;
  } else if (failedErrorTypes.includes("RUNTIME_ERROR")) {
    verdict = SubmissionVerdict.RUNTIME_ERROR;
  } else if (failedTests > 0) {
    verdict = SubmissionVerdict.WRONG_ANSWER;
  }

  return {
    verdict,
    totalTests,
    passedTests,
    failedTests,
  };
}
