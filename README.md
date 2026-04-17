# CodeForge

CodeForge is a full-stack asynchronous code execution platform designed to demonstrate real-world backend engineering, safe execution of untrusted workloads, and end-to-end system design.

The project is built phase-by-phase with strict validation gates, ensuring each layer (data, auth, async processing, execution, evaluation, frontend) is independently correct and defensible.

---

## Core Objective

Build a production-style system with the following flow:

1. User submits code
2. API validates and persists submission
3. Submission is enqueued (Redis + BullMQ)
4. Worker executes code in an isolated Docker sandbox
5. Results are stored in PostgreSQL
6. Verdict is computed deterministically
7. Frontend displays real-time status and results

---

## Tech Stack

* **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
* **Backend:** Node.js, Next.js API routes
* **Database:** PostgreSQL + Prisma ORM
* **Queue:** Redis + BullMQ
* **Execution Engine:** Docker (isolated sandbox with resource limits)
* **Auth:** JWT (secure, stateless authentication)

---

## Implemented Phases

* **Phase 1:** Project foundation (strict TypeScript, structure, infra setup)
* **Phase 2:** Relational data model with constraints, migrations, and QA
* **Phase 3:** JWT authentication, protected routes, submission API
* **Phase 4:** Async queue system (BullMQ + worker lifecycle)
* **Phase 5:** Docker-based sandbox execution (JS + C++, timeout, isolation)
* **Phase 6:** Deterministic verdict aggregation and submission stats
* **Phase 7:** Minimal but complete frontend (submission flow, polling, history)

---

## Project Structure

```text
src/
  app/           # Next.js pages and API routes
  components/    # UI components
  lib/           # Infrastructure (env, prisma, redis, auth)
  services/      # Business logic (auth, submission, execution, evaluation)
  worker/        # BullMQ worker process
  types/         # Shared TypeScript types

prisma/
  schema.prisma
  migrations/
  seed.ts
```

---

## Core Data Model

Entities:

* User
* Problem
* TestCase
* Submission
* ExecutionResult

Key decisions:

* Strong foreign keys for integrity
* Submission lifecycle: `QUEUED → RUNNING → COMPLETED → FAILED`
* Per-test execution results for reproducibility
* Snapshot-based storage (`input`, `expected`, `actual`)
* Deterministic verdict aggregation

---

## Execution System (Phase 5)

* Code runs inside **Docker containers**, not the host
* Isolation includes:

  * no network access
  * memory/CPU limits
  * read-only filesystem
  * non-root user
* Supports:

  * JavaScript (Node)
  * C++ (compile + run separation)
* Enforces:

  * per-test timeout
  * global execution safety
* Ensures:

  * cleanup of containers and temp files

---

## Verdict System (Phase 6)

Final submission verdict is derived from test results using strict priority:

```text
COMPILE_ERROR > TIMEOUT > RUNTIME_ERROR > WRONG_ANSWER > ACCEPTED
```

Each submission stores:

* verdict
* total tests
* passed tests
* failed tests

---

## Frontend (Phase 7)

Minimal, functional, and system-focused UI:

* Problem browsing
* Code submission interface
* Real-time polling for execution status
* Per-test result visualization
* Submission history
* JWT-based authentication

Key features:

* Polling with cleanup and resume support
* State persistence via localStorage
* Output truncation for large responses
* Clear loading, error, and empty states

---

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/ManasBhardwaj07/Codeforge.git
cd codeforge
npm install
```

---

### 2. Configure Environment

Create `.env` based on `.env.example`

---

### 3. Run Database

```bash
npm run db:migrate
npm run db:generate
npm run db:seed
```

---

### 4. Start Services

```bash
npm run dev       # frontend + API
npm run worker    # background worker (separate terminal)
```

---

### 5. Run QA Checks

```bash
npm run qa:phase2
npm run qa:phase3
npm run qa:phase4
npm run qa:phase5
npm run qa:phase6
```

---

## Scripts

* `npm run dev` — start development server
* `npm run build` — production build
* `npm run lint` — lint checks
* `npm run typecheck` — strict TypeScript validation
* `npm run check` — lint + typecheck + build

### Database

* `npm run db:migrate`
* `npm run db:generate`
* `npm run db:seed`

### QA

* `npm run qa:phase2`
* `npm run qa:phase3`
* `npm run qa:phase4`
* `npm run qa:phase5`
* `npm run qa:phase6`

### Worker

* `npm run worker`

---

## QA Coverage

Each phase includes automated validation:

* **Phase 2:** relational integrity, FK enforcement
* **Phase 3:** auth flow, protected routes, validation
* **Phase 4:** queue lifecycle, async behavior
* **Phase 5:** sandbox execution, timeout, cleanup
* **Phase 6:** verdict correctness and aggregation

---

## Security Practices

* `.env` is ignored
* `.env.example` provided
* No hardcoded secrets
* Containerized execution for untrusted code
* Resource limits enforced

---

## Development Approach

* Strict phase-based development
* Each phase requires measurable acceptance criteria
* QA-driven validation before progression
* Clear separation of concerns across layers

---

## Roadmap

* Phase 8: Production hardening (Dockerization, deployment, rate limiting, recovery)
* Future: observability, scaling, execution optimizations

---

## Summary

CodeForge is a project.
that demonstrates:

* asynchronous system design
* safe execution of untrusted workloads
* relational modeling
* deterministic evaluation logic
* full-stack integration

---
