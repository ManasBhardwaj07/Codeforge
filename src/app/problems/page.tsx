"use client";
import React, { useEffect, useState } from "react";
import { ProblemList, Problem } from "@/components/ProblemList";

export default function ProblemsPage() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/problems", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch problems");
        setProblems(await res.json());
      } catch (e: any) {
        setError(e.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <main className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Problems</h1>
      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : problems.length === 0 ? (
        <div className="text-gray-500">No problems found.</div>
      ) : (
        <ProblemList
          problems={problems}
          onSelect={(problem) => {
            window.location.href = `/problems/${problem.id}`;
          }}
        />
      )}
    </main>
  );
}
