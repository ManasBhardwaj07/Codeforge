import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { Queue } from "bullmq";
import { SubmissionStatus, SubmissionVerdict } from "../generated/prisma";
import { disconnectPrisma, prisma } from "./client";
import { POST as loginRoute } from "../src/app/api/auth/login/route";
import { POST as registerRoute } from "../src/app/api/auth/register/route";
import { POST as submitRoute } from "../src/app/api/submit/route";
import { closeSubmissionQueue, getQueueConnectionOptions, SUBMISSION_QUEUE_NAME } from "../src/lib/queue";
import { evaluateSubmission } from "../src/services/evaluation.service";

type CheckResult = {
  name: string;
  pass: boolean;
  details: string;
};

type WorkerChild = ReturnType<typeof spawn>;

const WAIT_TIMEOUT_MS = 45000;

function printResult(result: CheckResult) {
  const status = result.pass ? "PASS" : "FAIL";
  console.log(`[${status}] ${result.name} - ${result.details}`);
}

async function ensureRedisAvailable() {
  const connection = getQueueConnectionOptions();

  return new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({
      host: connection.host,
      port: connection.port,
    });

    const timeoutHandle = setTimeout(() => {
      socket.destroy();
      reject(
        new Error(
          `Redis is unreachable at ${connection.host}:${connection.port}. Start Redis first (for example: docker start codeforge-redis).`,
        ),
      );
    }, 1000);

    socket.once("connect", () => {
      clearTimeout(timeoutHandle);
      socket.end();
      resolve();
    });

    socket.once("error", () => {
      clearTimeout(timeoutHandle);
      reject(
        new Error(
          `Redis is unreachable at ${connection.host}:${connection.port}. Start Redis first (for example: docker start codeforge-redis).`,
        ),
      );
    });
  });
}

function startWorker(projectRoot: string): Promise<{ child: WorkerChild; getLogs: () => string }> {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn("cmd.exe", ["/d", "/s", "/c", "npm run worker --silent"], {
            cwd: projectRoot,
            stdio: ["ignore", "pipe", "pipe"],
          })
        : spawn("npm", ["run", "worker", "--silent"], {
            cwd: projectRoot,
            stdio: ["ignore", "pipe", "pipe"],
          });

    let logs = "";

    const onData = (data: Buffer) => {
      logs += data.toString();
      if (logs.includes("Submission worker is ready")) {
        resolve({
          child,
          getLogs: () => logs,
        });
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (error) => reject(error));

    setTimeout(() => {
      if (!logs.includes("Submission worker is ready")) {
        reject(new Error(`Worker failed to start. Logs: ${logs}`));
      }
    }, 7000);
  });
}

async function stopWorker(child: WorkerChild): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    if (child.pid) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      });
    }
    return;
  }

  child.kill("SIGTERM");
  await wait(300);

  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

async function loginAndGetToken(email: string, username: string, password: string) {
  const registerResponse = await registerRoute(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    }),
  );

  if (registerResponse.status !== 201) {
    throw new Error(`Register failed with status ${registerResponse.status}`);
  }

  const loginResponse = await loginRoute(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );

  const loginBody = (await loginResponse.json()) as { token?: string };
  if (!loginBody.token) {
    throw new Error("Failed to get auth token");
  }

  return loginBody.token;
}

async function submitAndWaitForVerdict(params: {
  token: string;
  problemId: string;
  code: string;
  language: "JAVASCRIPT" | "CPP";
}) {
  const response = await submitRoute(
    new Request("http://localhost/api/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${params.token}`,
      },
      body: JSON.stringify({
        problemId: params.problemId,
        code: params.code,
        language: params.language,
      }),
    }),
  );

  const body = (await response.json()) as {
    submission?: {
      id: string;
    };
  };

  if (response.status !== 201 || !body.submission?.id) {
    throw new Error(`Submission failed: status=${response.status}`);
  }

  const submissionId = body.submission.id;
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const current = await prisma.submission.findUnique({
      where: {
        id: submissionId,
      },
      select: {
        status: true,
        verdict: true,
        totalTests: true,
        passedTests: true,
        failedTests: true,
      },
    });

    if (current && (current.status === SubmissionStatus.COMPLETED || current.status === SubmissionStatus.FAILED)) {
      return {
        submissionId,
        ...current,
      };
    }

    await wait(100);
  }

  throw new Error(`Timed out waiting for submission ${submissionId}`);
}

async function runQa() {
  const checks: CheckResult[] = [];

  await ensureRedisAvailable();

  const queue = new Queue(SUBMISSION_QUEUE_NAME, {
    connection: getQueueConnectionOptions(),
  });

  let workerHandle: { child: WorkerChild; getLogs: () => string } | null = null;

  try {
    workerHandle = await startWorker(process.cwd());

    const problem = await prisma.problem.findUnique({
      where: {
        slug: "two-sum-variant",
      },
      select: {
        id: true,
        testCases: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!problem || problem.testCases.length === 0) {
      throw new Error("two-sum-variant problem with test cases is required");
    }

    const uniqueSuffix = Date.now().toString();
    const email = `phase6_${uniqueSuffix}@codeforge.dev`;
    const username = `phase6_user_${uniqueSuffix}`;
    const password = "StrongPass123!";
    const token = await loginAndGetToken(email, username, password);

    const acceptedResult = await submitAndWaitForVerdict({
      token,
      problemId: problem.id,
      language: "JAVASCRIPT",
      code: [
        "let input = '';",
        "process.stdin.setEncoding('utf8');",
        "process.stdin.on('data', (chunk) => { input += chunk; });",
        "process.stdin.on('end', () => {",
        "  const nums = input.trim().split(/\\s+/).filter(Boolean).map(Number);",
        "  const total = nums.reduce((acc, value) => acc + value, 0);",
        "  process.stdout.write(String(total));",
        "});",
      ].join("\n"),
    });

    checks.push({
      name: "All-pass submission becomes ACCEPTED",
      pass:
        acceptedResult.status === SubmissionStatus.COMPLETED &&
        acceptedResult.verdict === SubmissionVerdict.ACCEPTED &&
        acceptedResult.totalTests === problem.testCases.length &&
        acceptedResult.passedTests === problem.testCases.length &&
        acceptedResult.failedTests === 0,
      details: `status=${acceptedResult.status}, verdict=${acceptedResult.verdict}, pass=${acceptedResult.passedTests}/${acceptedResult.totalTests}`,
    });

    const wrongAnswerResult = await submitAndWaitForVerdict({
      token,
      problemId: problem.id,
      language: "JAVASCRIPT",
      code: "process.stdout.write('0');",
    });

    checks.push({
      name: "Partial/failed output becomes WRONG_ANSWER",
      pass:
        wrongAnswerResult.status === SubmissionStatus.COMPLETED &&
        wrongAnswerResult.verdict === SubmissionVerdict.WRONG_ANSWER &&
        wrongAnswerResult.failedTests > 0,
      details: `status=${wrongAnswerResult.status}, verdict=${wrongAnswerResult.verdict}, fail=${wrongAnswerResult.failedTests}`,
    });

    const timeoutResult = await submitAndWaitForVerdict({
      token,
      problemId: problem.id,
      language: "JAVASCRIPT",
      code: "while (true) {}",
    });

    checks.push({
      name: "Timeout submission becomes TIMEOUT",
      pass:
        timeoutResult.status === SubmissionStatus.COMPLETED &&
        timeoutResult.verdict === SubmissionVerdict.TIMEOUT &&
        timeoutResult.failedTests > 0,
      details: `status=${timeoutResult.status}, verdict=${timeoutResult.verdict}`,
    });

    const runtimeErrorResult = await submitAndWaitForVerdict({
      token,
      problemId: problem.id,
      language: "JAVASCRIPT",
      code: "throw new Error('boom');",
    });

    checks.push({
      name: "Runtime crash becomes RUNTIME_ERROR",
      pass:
        runtimeErrorResult.status === SubmissionStatus.COMPLETED &&
        runtimeErrorResult.verdict === SubmissionVerdict.RUNTIME_ERROR &&
        runtimeErrorResult.failedTests > 0,
      details: `status=${runtimeErrorResult.status}, verdict=${runtimeErrorResult.verdict}`,
    });

    const compileErrorResult = await submitAndWaitForVerdict({
      token,
      problemId: problem.id,
      language: "CPP",
      code: [
        "#include <iostream>",
        "int main() {",
        "  std::cout << \"broken\"",
        "  return 0;",
        "}",
      ].join("\n"),
    });

    checks.push({
      name: "Compile failure becomes COMPILE_ERROR",
      pass:
        compileErrorResult.status === SubmissionStatus.COMPLETED &&
        compileErrorResult.verdict === SubmissionVerdict.COMPILE_ERROR &&
        compileErrorResult.totalTests === problem.testCases.length &&
        compileErrorResult.passedTests === 0 &&
        compileErrorResult.failedTests === problem.testCases.length,
      details: `status=${compileErrorResult.status}, verdict=${compileErrorResult.verdict}, fail=${compileErrorResult.failedTests}`,
    });

    const acceptedSubmission = await prisma.submission.findUniqueOrThrow({
      where: {
        id: acceptedResult.submissionId,
      },
      select: {
        userId: true,
      },
    });

    const syntheticSubmission = await prisma.submission.create({
      data: {
        userId: acceptedSubmission.userId,
        problemId: problem.id,
        language: "JAVASCRIPT",
        code: "console.log('synthetic')",
        status: SubmissionStatus.COMPLETED,
      },
      select: {
        id: true,
      },
    });

    const testCaseIds = problem.testCases.map((testCase) => testCase.id);

    if (testCaseIds.length < 3) {
      throw new Error("Phase 6 QA requires at least 3 test cases for priority simulation");
    }

    await prisma.executionResult.createMany({
      data: [
        {
          submissionId: syntheticSubmission.id,
          testCaseId: testCaseIds[0]!,
          inputSnapshot: "",
          expectedOutputSnapshot: "",
          actualOutput: "",
          stderr: "[TIMEOUT] simulated timeout",
          exitCode: null,
          executionTimeMs: null,
          passed: false,
        },
        {
          submissionId: syntheticSubmission.id,
          testCaseId: testCaseIds[1]!,
          inputSnapshot: "",
          expectedOutputSnapshot: "",
          actualOutput: "",
          stderr: "[COMPILE_ERROR] simulated compile error",
          exitCode: null,
          executionTimeMs: null,
          passed: false,
        },
        {
          submissionId: syntheticSubmission.id,
          testCaseId: testCaseIds[2]!,
          inputSnapshot: "",
          expectedOutputSnapshot: "",
          actualOutput: "",
          stderr: "",
          exitCode: 0,
          executionTimeMs: 1,
          passed: true,
        },
      ],
    });

    const priorityEvaluation = await evaluateSubmission(syntheticSubmission.id);

    checks.push({
      name: "Aggregation priority favors COMPILE_ERROR over TIMEOUT",
      pass:
        priorityEvaluation.verdict === SubmissionVerdict.COMPILE_ERROR &&
        priorityEvaluation.totalTests === 3 &&
        priorityEvaluation.passedTests === 1 &&
        priorityEvaluation.failedTests === 2,
      details: `verdict=${priorityEvaluation.verdict}, pass=${priorityEvaluation.passedTests}, fail=${priorityEvaluation.failedTests}`,
    });
  } finally {
    await queue.close();
    await closeSubmissionQueue();

    if (workerHandle) {
      await stopWorker(workerHandle.child);
    }
  }

  console.log("\nPhase 6 QA Summary");
  for (const check of checks) {
    printResult(check);
  }

  const failed = checks.filter((check) => !check.pass);
  if (failed.length > 0) {
    console.error(`\nPhase 6 QA failed: ${failed.length} checks failed.`);
    process.exitCode = 1;
    return;
  }

  console.log("\nAll Phase 6 QA checks passed.");
}

void runQa()
  .catch((error) => {
    console.error("Phase 6 QA execution failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSubmissionQueue();
    await disconnectPrisma();
  });
