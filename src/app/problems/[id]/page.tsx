import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CodeEditor } from "@/components/CodeEditor";
import { getToken } from "@/lib/auth-client";
import { SubmissionStatus } from "@/components/SubmissionStatus";

function SubmissionResults({ submission }: { submission: any }) {
  if (!submission?.executionResults || submission.executionResults.length === 0) {
    return null;
  }
  return (
    <div className="mt-6">
      <h3 className="font-semibold mb-2">Test Case Results</h3>
      <table className="w-full border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left">#</th>
            <th className="p-2 text-left">Input</th>
            <th className="p-2 text-left">Expected</th>
            <th className="p-2 text-left">Actual</th>
            <th className="p-2 text-left">Pass</th>
            <th className="p-2 text-left">Error</th>
          </tr>
        </thead>
        <tbody>
          {submission.executionResults.map((res: any, idx: number) => (
            <tr key={res.testCaseId || idx} className="border-t">
              <td className="p-2">{idx + 1}</td>
              <td className="p-2 whitespace-pre-line max-w-xs">{res.inputSnapshot}</td>
              <td className="p-2 whitespace-pre-line max-w-xs">{res.expectedOutputSnapshot}</td>
              <td className="p-2 whitespace-pre-line max-w-xs">{res.actualOutput}</td>
              <td className="p-2">{res.passed ? "✅" : "❌"}</td>
              <td className="p-2 text-xs text-red-600">{res.stderr || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
  // Output truncation helper for large outputs
  function TruncatedText({ text, max = 300, ariaLabel }: { text: string, max?: number, ariaLabel?: string }) {
    const [expanded, setExpanded] = React.useState(false);
    if (!text) return <span>-</span>;
    if (text.length <= max) return <span>{text}</span>;
    return (
      <span>
        {expanded ? text : text.slice(0, max) + "..."}
        <button
          type="button"
          className="ml-2 underline text-blue-600 focus:outline-none focus:ring focus:ring-blue-300 rounded px-1"
          aria-label={ariaLabel || (expanded ? "Show less" : "Show more")}
          tabIndex={0}
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      </span>
    );
  }

  function SubmissionResults({ submission }: { submission: any }) {
    if (!submission?.executionResults || submission.executionResults.length === 0) {
      return <div className="text-gray-500 mt-6">No test cases executed.</div>;
    }
    return (
      <div className="mt-6">
        <h3 className="font-semibold mb-2">Test Case Results</h3>
        <table className="w-full border text-sm" aria-label="Test case results table">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 text-left">#</th>
              <th className="p-2 text-left">Input</th>
              <th className="p-2 text-left">Expected</th>
              <th className="p-2 text-left">Actual</th>
              <th className="p-2 text-left">Pass</th>
              <th className="p-2 text-left">Error</th>
            </tr>
          </thead>
          <tbody>
            {submission.executionResults.map((res: any, idx: number) => (
              <tr key={res.testCaseId || idx} className="border-t">
                <td className="p-2">{idx + 1}</td>
                <td className="p-2 whitespace-pre-line max-w-xs"><TruncatedText text={res.inputSnapshot} ariaLabel="Show more input" /></td>
                <td className="p-2 whitespace-pre-line max-w-xs"><TruncatedText text={res.expectedOutputSnapshot} ariaLabel="Show more expected output" /></td>
                <td className="p-2 whitespace-pre-line max-w-xs"><TruncatedText text={res.actualOutput} ariaLabel="Show more actual output" /></td>
                <td className="p-2">{res.passed ? "✅" : "❌"}</td>
                <td className="p-2 text-xs text-red-600"><TruncatedText text={res.stderr || ""} ariaLabel="Show more error" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

async function fetchProblem(id: string) {
  const res = await fetch(`/api/problems?id=${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch problem");
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

const LANGUAGES = [
  { value: "JAVASCRIPT", label: "JavaScript" },
  { value: "CPP", label: "C++" },
];

export default async function ProblemDetailPage({ params }: { params: { id: string } }) {
  const problem = await fetchProblem(params.id);

  // UI state will be handled by client-side hydration
  return (
    <main className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-2">{problem.title}</h1>
      <div className="mb-4 text-gray-700 whitespace-pre-line">{problem.description}</div>
      <div className="mb-4">
        <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">
          {problem.difficulty}
        </span>
      </div>
      <ProblemCodeInput problemId={problem.id} />
    </main>
  );
}


function ProblemCodeInput({ problemId }: { problemId: string }) {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("JAVASCRIPT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Persist submissionId in localStorage per problem
  const storageKey = `lastSubmissionId:${problemId}`;
  const [submissionId, setSubmissionId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(storageKey);
    }
    return null;
  });
  const [polling, setPolling] = useState(false);
  const [submission, setSubmission] = useState<any>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  React.useEffect(() => {
    let interval: any;
    if (submissionId) {
      setPolling(true);
      setPollError(null);
      // Persist submissionId
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, submissionId);
      }
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/submissions/${submissionId}`);
          if (res.status === 401 || res.status === 403) {
            // Token expired, redirect to login
            window.location.href = "/login";
            return;
          }
          if (res.ok) {
            const data = await res.json();
            setSubmission(data.submission || data);
            if (data.submission?.status === "COMPLETED" || data.submission?.status === "FAILED" || data.status === "COMPLETED" || data.status === "FAILED") {
              clearInterval(interval);
              setPolling(false);
            }
          } else {
            setPollError("Failed to fetch submission status");
          }
        } catch (e: any) {
          setPollError(e?.message || "Unknown polling error");
        }
      }, 2000);
    } else {
      // Clear persisted submissionId if none
      if (typeof window !== "undefined") {
        localStorage.removeItem(storageKey);
      }
    }
    return () => interval && clearInterval(interval);
  }, [submissionId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSubmissionId(null);
    setSubmission(null);
    try {
      const token = getToken();
      if (!token) {
        setError("You must be logged in to submit.");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          problemId,
          code,
          language,
        }),
      });
      if (res.status === 401 || res.status === 403) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.submission?.id) {
        throw new Error(data.error || "Submission failed");
      }
      setSubmissionId(data.submission.id);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="block text-sm font-medium mb-1">Language</label>
        <select
          className="border rounded p-2"
          value={language}
          onChange={e => setLanguage(e.target.value)}
        >
          {LANGUAGES.map(lang => (
            <option key={lang.value} value={lang.value}>{lang.label}</option>
          ))}
        </select>
      </div>
      <CodeEditor value={code} onChange={setCode} language={language} />
      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
        disabled={loading || !code.trim() || polling}
      >
        {loading ? "Submitting..." : polling ? "Waiting..." : "Submit"}
      </button>
      {error && <div className="text-red-600 text-sm">{error}</div>}
        {error && <div className="text-red-600 text-sm" role="alert">{error}</div>}
      {submissionId && (
        <div className="text-green-700 text-sm mt-2">
          Submission ID: <span className="font-mono">{submissionId}</span>
        </div>
      )}
      {polling && <div className="text-gray-500 text-sm">Waiting for result...</div>}
      {pollError && <div className="text-red-600 text-sm">{pollError}</div>}
        {pollError && <div className="text-red-600 text-sm" role="alert">{pollError}</div>}
      {submission && (
        <div className="mt-4">
          <SubmissionStatus status={submission.status} verdict={submission.verdict} />
          <SubmissionResults submission={submission} />
        </div>
      )}
        {submission && (
          <div className="mt-4">
            <SubmissionStatus status={submission.status} verdict={submission.verdict} />
            <SubmissionResults submission={submission} />
            {submission.errorCode && (
              <div className="text-red-700 text-sm mt-2" role="alert">
                Error: <span className="font-mono">{submission.errorCode}</span> {submission.errorMessage && `- ${submission.errorMessage}`}
              </div>
            )}
          </div>
        )}
    </form>
  );
}
