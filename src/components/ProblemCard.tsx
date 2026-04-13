import React from "react";
import { Problem } from "./ProblemList";

export function ProblemCard({ problem }: { problem: Problem }) {
  return (
    <div className="border rounded p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">{problem.title}</h2>
        <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">
          {problem.difficulty}
        </span>
      </div>
      <p className="text-gray-600 mt-2">{problem.description}</p>
    </div>
  );
}
