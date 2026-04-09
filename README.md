# CodeForge

CodeForge is an asynchronous code execution platform built to demonstrate real backend systems thinking, relational data modeling, and safe workload execution architecture.

This repository is developed phase by phase. The current implementation includes:

- Phase 1: Project foundation
- Phase 2: Core relational data model with migrations, seed data, and QA checks

## Core Goal

Build a defendable end-to-end system with this mandatory flow:

1. User submits code
2. API validates request
3. Submission enters queue
4. Worker executes code in isolated runtime
5. Results persist to PostgreSQL
6. Frontend displays submission status and result

## Tech Stack

- Next.js (App Router)
- TypeScript (strict mode)
- PostgreSQL
- Prisma ORM
- Redis (BullMQ integration planned in next phase)
- Docker (execution isolation planned in upcoming phases)

## Project Structure

```text
src/
	app/           # App Router pages and API routes
	lib/           # Infrastructure clients (env, prisma, redis)
	services/      # Business/domain logic
	types/         # Shared TypeScript types

prisma/
	schema.prisma
	migrations/
	seed.ts
	phase2-qa.ts
```

## Current Data Model (Phase 2)

Entities implemented:

- User
- Problem
- TestCase
- Submission
- ExecutionResult

Key modeling decisions:

- Strong foreign keys for relational integrity
- Submission lifecycle status enum (`QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`)
- Programming language enum for controlled execution types
- ExecutionResult snapshots (`inputSnapshot`, `expectedOutputSnapshot`, `actualOutput`) for reproducibility
- Data-preserving migration from `sourceCode` to `code`

## Setup

### 1. Clone and install

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and set values.

Required keys:

- `DATABASE_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `JWT_SECRET`

### 3. Run migrations and generate client

```bash
npm run db:migrate
npm run db:generate
```

### 4. Seed sample data

```bash
npm run db:seed
```

### 5. Run QA checks

```bash
npm run qa:phase2
```

### 6. Start app

```bash
npm run dev
```

Health endpoint:

- `GET /api/health`

## Scripts

- `npm run dev` - start development server
- `npm run build` - production build
- `npm run lint` - lint checks
- `npm run typecheck` - strict TypeScript check
- `npm run check` - lint + typecheck + build
- `npm run db:migrate` - apply dev migration
- `npm run db:generate` - generate Prisma client
- `npm run db:seed` - seed core data
- `npm run qa:phase2` - phase 2 acceptance QA checks

## QA Coverage (Phase 2)

The Phase 2 QA script validates:

- Seed data availability (2+ problems, 5+ test cases)
- User -> Submissions relation
- Problem -> TestCases relation
- Submission -> ExecutionResults relation
- Foreign key enforcement (invalid insert rejected)

## Security and Repository Hygiene

- `.env` is ignored by git
- `.env.example` is committed for safe onboarding
- Generated Prisma output is ignored and recreated via scripts

## Roadmap

Planned upcoming phases:

- Phase 3: JWT auth and protected APIs
- Phase 4: BullMQ queue integration
- Phase 5: Docker-based code execution engine
- Phase 6+: Evaluation, lifecycle tracking, realtime updates, hardening, deployment

## Development Policy

This project follows strict phase gates:

- Each phase requires measurable acceptance criteria
- No phase is marked complete without validation evidence
- README is updated phase by phase as implementation evolves
