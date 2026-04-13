import React from "react";

export function SubmissionStatus({ status, verdict }: {
  status: string;
  verdict?: string | null;
}) {
  return (
    <div className="my-2">
      <div className="text-sm text-gray-700">
        <span className="font-semibold">Status:</span> {status}
      </div>
      {verdict && (
        <div className="text-sm text-gray-700">
          <span className="font-semibold">Verdict:</span> {verdict}
        </div>
      )}
    </div>
  );
}
