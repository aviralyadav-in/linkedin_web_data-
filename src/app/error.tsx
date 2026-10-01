"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-950/60 dark:text-red-400">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4m0 4h.01" />
          </svg>
        </div>

        <h1 className="mt-4 text-lg font-semibold tracking-tight">Couldn&apos;t connect to the database</h1>
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          The dashboard couldn&apos;t load contact data. Check the items below, then try again.
        </p>

        <ul className="mt-5 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-left text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {[
            <>The PostgreSQL service is running</>,
            <>
              <code className="rounded bg-zinc-200/70 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">.env</code> has
              the correct{" "}
              <code className="rounded bg-zinc-200/70 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                DATABASE_URL
              </code>
            </>,
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-zinc-600 dark:text-zinc-300">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500"
                aria-hidden="true"
              >
                <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-3-10 2 2 4-4" />
              </svg>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-zinc-700 active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
          </svg>
          Try again
        </button>

        {error.digest && (
          <p className="mt-4 text-[11px] text-zinc-500 dark:text-zinc-400">
            Error code: <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </div>
    </main>
  );
}
