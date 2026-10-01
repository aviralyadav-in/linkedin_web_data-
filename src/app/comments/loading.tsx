// Skeleton that mirrors the User comments page: header, the form, the results (on the right on a wide screen),
// then the earlier lookups.
export default function Loading() {
  return (
    <div className="w-full" aria-busy="true" aria-label="Loading user comments">
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex w-full animate-pulse items-center gap-3 px-4 py-3 sm:px-6">
          <div className="h-9 w-9 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="hidden h-3 w-56 rounded bg-zinc-200/70 sm:block dark:bg-zinc-800/70" />
          </div>
          <div className="hidden h-9 w-56 rounded-lg bg-zinc-100 sm:block dark:bg-zinc-900" />
          <div className="h-6 w-24 rounded-full bg-zinc-100 dark:bg-zinc-900" />
        </div>
      </div>
      <div className="grid w-full grid-cols-1 items-start gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[auto_1fr]">
        <div className="h-96 animate-pulse rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" />
        <div className="animate-pulse space-y-3 rounded-xl border border-zinc-200 bg-white p-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-12 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-24 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" />
      </div>
    </div>
  );
}
