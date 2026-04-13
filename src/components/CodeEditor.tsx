import React from "react";

export function CodeEditor({ value, onChange, language }: {
  value: string;
  onChange: (val: string) => void;
  language: string;
}) {
  return (
    <div>
      <label htmlFor="code-editor" className="block text-sm font-medium mb-1">Code</label>
      <textarea
        id="code-editor"
        className="w-full h-48 border rounded p-2 font-mono text-sm resize-y focus:outline-none focus:ring focus:ring-blue-300"
        value={value}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        aria-label="Code editor"
      />
    </div>
  );
}
