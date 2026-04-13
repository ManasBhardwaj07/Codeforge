import { Worker } from "bullmq";
import { SubmissionStatus } from "../../generated/prisma";
import { getQueueConnectionOptions, SUBMISSION_QUEUE_NAME, type SubmissionJobData } from "../lib/queue";
import { prisma } from "../lib/prisma";
import {
  DEFAULT_GLOBAL_TIMEOUT_MS,
  DEFAULT_PER_TEST_TIMEOUT_MS,
  executeInSandbox,
} from "../services/execution.service";
import { evaluateSubmission } from "../services/evaluation.service";

const STALE_RUNNING_TIMEOUT_MS = 5 * 60 * 1000;
const STALE_RECOVERY_INTERVAL_MS = 60 * 1000;
const WORKER_PER_TEST_TIMEOUT_MS = Math.max(DEFAULT_PER_TEST_TIMEOUT_MS, 5000);

async function recoverStaleRunningSubmissions() {
  const cutoff = new Date(Date.now() - STALE_RUNNING_TIMEOUT_MS);

  const recovered = await prisma.submission.updateMany({
    where: {
      status: SubmissionStatus.RUNNING,
      startedAt: {
        lt: cutoff,
      },
    },
    data: {
      status: SubmissionStatus.FAILED,
      failedAt: new Date(),
    },
  });

  if (recovered.count > 0) {
    console.warn(`Recovered stale RUNNING submissions: ${recovered.count}`);
  }
}

function normalizeOutput(value: string): string {
  return value.replace(/\r\n/g, "\n").trimEnd();
}

function formatErrorForPersistence(errorType: string | null, stderr: string) {
  if (!errorType) {
    return stderr.length > 0 ? stderr : null;
  }

  if (stderr.length === 0) {
    return `[${errorType}]`;
  }

  return `[${errorType}] ${stderr}`;
}

async function createExecutionResultRecord(params: {
  submissionId: string;
  testCaseId: string;
  inputSnapshot: string;
  expectedOutputSnapshot: string;
  actualOutput: string;
  stderr: string | null;
  exitCode: number | null;
  executionTimeMs: number | null;
  passed: boolean;
}) {
  await prisma.executionResult.create({
    data: {
      submissionId: params.submissionId,
      testCaseId: params.testCaseId,
      inputSnapshot: params.inputSnapshot,
      expectedOutputSnapshot: params.expectedOutputSnapshot,
      actualOutput: params.actualOutput,
      stderr: params.stderr,
      exitCode: params.exitCode,
      executionTimeMs: params.executionTimeMs,
      passed: params.passed,
    },
  });
}

async function executeSubmission(submissionId: string) {
  const submission = await prisma.submission.findUnique({
    where: {
      id: submissionId,
    },
    select: {
      id: true,
      language: true,
      code: true,
      problem: {
        select: {
          testCases: {
            orderBy: {
              orderIndex: "asc",
            },
            select: {
              id: true,
              input: true,
              expectedOutput: true,
            },
          },
        },
      },
    },
  });

  if (!submission) {
    throw new Error(`Submission ${submissionId} not found`);
  }

  const testCases = submission.problem.testCases;

  if (testCases.length === 0) {
    throw new Error(`Problem has no test cases for submission ${submissionId}`);
  }

  await prisma.executionResult.deleteMany({
    where: {
      submissionId,
    },
  });

  const submissionDeadline = Date.now() + DEFAULT_GLOBAL_TIMEOUT_MS;
  let infrastructureFailure: string | null = null;

  for (let index = 0; index < testCases.length; index += 1) {
    const testCase = testCases[index];

    if (!testCase) {
      continue;
    }

    const remainingMs = submissionDeadline - Date.now();

    if (remainingMs <= 0) {
      for (let pendingIndex = index; pendingIndex < testCases.length; pendingIndex += 1) {
        const pendingCase = testCases[pendingIndex];

        if (!pendingCase) {
          continue;
        }

        await createExecutionResultRecord({
          submissionId,
          testCaseId: pendingCase.id,
          inputSnapshot: pendingCase.input,
          expectedOutputSnapshot: pendingCase.expectedOutput,
          actualOutput: "",
          stderr: `[TIMEOUT] Global submission timeout exceeded (${DEFAULT_GLOBAL_TIMEOUT_MS}ms)`,
          exitCode: null,
          executionTimeMs: null,
          passed: false,
        });
      }

      break;
    }

    try {
      const outcome = await executeInSandbox({
        language: submission.language,
        code: submission.code,
        input: testCase.input,
        policy: {
          perTestTimeoutMs: WORKER_PER_TEST_TIMEOUT_MS,
          globalTimeoutMs: remainingMs,
        },
        context: {
          submissionId,
          testCaseId: testCase.id,
        },
      });

      const passed =
        outcome.success && !outcome.timedOut &&
        normalizeOutput(outcome.stdout) === normalizeOutput(testCase.expectedOutput);

      console.info(
        [
          "Execution metadata",
          `submissionId=${submissionId}`,
          `testCaseId=${testCase.id}`,
          `errorType=${outcome.errorType ?? "NONE"}`,
          `durationMs=${outcome.executionTimeMs}`,
          `containerId=${outcome.metadata.containerId ?? "n/a"}`,
          `compileContainerId=${outcome.metadata.compileContainerId ?? "n/a"}`,
          `runContainerId=${outcome.metadata.runContainerId ?? "n/a"}`,
          `outputTruncated=${outcome.metadata.outputTruncated}`,
        ].join(" | "),
      );

      await createExecutionResultRecord({
        submissionId,
        testCaseId: testCase.id,
        inputSnapshot: testCase.input,
        expectedOutputSnapshot: testCase.expectedOutput,
        actualOutput: outcome.stdout,
        stderr: formatErrorForPersistence(outcome.errorType, outcome.stderr),
        exitCode: outcome.exitCode,
        executionTimeMs: outcome.executionTimeMs,
        passed,
      });

      if (outcome.errorType === "COMPILE_ERROR") {
        for (let pendingIndex = index + 1; pendingIndex < testCases.length; pendingIndex += 1) {
          const pendingCase = testCases[pendingIndex];

          if (!pendingCase) {
            continue;
          }

          await createExecutionResultRecord({
            submissionId,
            testCaseId: pendingCase.id,
            inputSnapshot: pendingCase.input,
            expectedOutputSnapshot: pendingCase.expectedOutput,
            actualOutput: "",
            stderr: "[COMPILE_ERROR] Skipped due to compilation failure on an earlier test case",
            exitCode: null,
            executionTimeMs: null,
            passed: false,
          });
        }

        break;
      }
    } catch (error) {
      infrastructureFailure = error instanceof Error ? error.message : "Unknown execution infrastructure failure";

      await createExecutionResultRecord({
        submissionId,
        testCaseId: testCase.id,
        inputSnapshot: testCase.input,
        expectedOutputSnapshot: testCase.expectedOutput,
        actualOutput: "",
        stderr: `[INFRA_ERROR] ${infrastructureFailure}`,
        exitCode: null,
        executionTimeMs: null,
        passed: false,
      });

      break;
    }
  }

  if (infrastructureFailure) {
    throw new Error(infrastructureFailure);
  }
}

const worker = new Worker<SubmissionJobData>(
  SUBMISSION_QUEUE_NAME,
  async (job) => {
    const { submissionId } = job.data;

    console.log(`Processing submission: ${submissionId}`);

    const started = await prisma.submission.updateMany({
      where: {
        id: submissionId,
        status: SubmissionStatus.QUEUED,
      },
      data: {
        status: SubmissionStatus.RUNNING,
        startedAt: new Date(),
        verdict: null,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        completedAt: null,
        failedAt: null,
      },
    });

    if (started.count === 0) {
      throw new Error(`Submission ${submissionId} is not QUEUED or does not exist`);
    }

    await executeSubmission(submissionId);
    const evaluation = await evaluateSubmission(submissionId);

    const completed = await prisma.submission.updateMany({
      where: {
        id: submissionId,
        status: SubmissionStatus.RUNNING,
      },
      data: {
        status: SubmissionStatus.COMPLETED,
        verdict: evaluation.verdict,
        totalTests: evaluation.totalTests,
        passedTests: evaluation.passedTests,
        failedTests: evaluation.failedTests,
        completedAt: new Date(),
        failedAt: null,
      },
    });

    if (completed.count === 0) {
      throw new Error(`Submission ${submissionId} is not RUNNING when completing`);
    }

    console.log(`Completed submission: ${submissionId}`);
  },
  {
    connection: getQueueConnectionOptions(),
    concurrency: 2,
  },
);

void recoverStaleRunningSubmissions();

const staleRecoveryTimer = setInterval(() => {
  void recoverStaleRunningSubmissions();
}, STALE_RECOVERY_INTERVAL_MS);

staleRecoveryTimer.unref();

worker.on("ready", () => {
  console.log("Submission worker is ready");
});

worker.on("failed", async (job, error) => {
  const submissionId = job?.data?.submissionId;

  if (submissionId) {
    await prisma.submission.updateMany({
      where: {
        id: submissionId,
        status: {
          in: [SubmissionStatus.QUEUED, SubmissionStatus.RUNNING],
        },
      },
      data: {
        status: SubmissionStatus.FAILED,
        failedAt: new Date(),
      },
    });
  }

  console.error(`Failed job ${job?.id ?? "unknown"}:`, error.message);
});

worker.on("error", (error) => {
  console.error("Worker runtime error:", error);
});

async function shutdown() {
  clearInterval(staleRecoveryTimer);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
