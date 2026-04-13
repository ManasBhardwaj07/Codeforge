import React from "react";

export type Problem = {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: string;
};

export function ProblemList({ problems, onSelect }: {
  problems: Problem[];
  onSelect?: (problem: Problem) => void;
}) {
  if (!problems || problems.length === 0) {
    return <div className="text-gray-500">No problems found.</div>;
  }
  return (
    <div className="space-y-4">
      {problems.map((problem, idx) => (
        <div
          key={problem.id}
          className="border rounded p-4 cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring focus:ring-blue-300"
          onClick={() => onSelect?.(problem)}
          tabIndex={0}
          aria-label={`Select problem ${problem.title}`}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") onSelect?.(problem);
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">{problem.title}</h2>
            <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">
              {problem.difficulty}
            </span>
          </div>
          <p className="text-gray-600 mt-1 line-clamp-2">{problem.description}</p>
        </div>
      ))}
    </div>
  );
}
