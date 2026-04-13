"use client";
import React, { useEffect, useState } from "react";
import { SubmissionTable, Submission } from "@/components/SubmissionTable";
import { getToken } from "@/lib/auth-client";

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = getToken();
        if (!token) {
          window.location.href = "/login";
          return;
        }
        const res = await fetch("/api/my-submissions", {
          cache: "no-store",
          headers: {
            authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) throw new Error("Failed to fetch submissions");
        setSubmissions(await res.json());
      } catch (e: any) {
        setError(e.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <main className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Submission History</h1>
      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : submissions.length === 0 ? (
        <div className="text-gray-500">No submissions found.</div>
      ) : (
        <SubmissionTable submissions={submissions} />
      )}
    </main>
  );
}
