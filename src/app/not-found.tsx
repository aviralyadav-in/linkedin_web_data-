import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
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
            <path d="m21 21-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-3-8h6" />
          </svg>
        </div>

        <p className="mt-4 text-5xl font-semibold tracking-tight tabular-nums text-zinc-300 dark:text-zinc-700">
          404
        </p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">Yeh page nahi mila</h1>
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          Jo page aap dhoond rahe ho vo exist nahi karta ya move ho gaya hai.
        </p>

        <Link
          href="/"
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
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Zm6 13V12h6v10" />
          </svg>
          Dashboard par wapas jao
        </Link>
      </div>
    </main>
  );
}
