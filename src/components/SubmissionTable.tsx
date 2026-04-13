import React from "react";

export type Submission = {
  id: string;
  problem: { title: string };
  verdict: string;
  createdAt: string;
};

export function SubmissionTable({ submissions }: { submissions: Submission[] }) {
  if (!submissions || submissions.length === 0) {
    return <div className="text-gray-500">No submissions found.</div>;
  }
  return (
    <table className="w-full border mt-4 text-sm" aria-label="Submission history table">
      <thead>
        <tr className="bg-gray-100">
          <th className="p-2 text-left">Problem</th>
          <th className="p-2 text-left">Verdict</th>
          <th className="p-2 text-left">Submitted At</th>
        </tr>
      </thead>
      <tbody>
        {submissions.map((sub) => (
          <tr key={sub.id} className="border-t">
            <td className="p-2">{sub.problem.title}</td>
            <td className="p-2">{sub.verdict}</td>
            <td className="p-2">{new Date(sub.createdAt).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
