// Skeleton that mirrors the commands page: header, the run form, the run panel (on the right on a wide screen),
// then history and the session card.
export default function Loading() {
  return (
    <div className="w-full" aria-busy="true" aria-label="Loading commands">
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex w-full animate-pulse items-center gap-3 px-4 py-3 sm:px-6">
          <div className="h-9 w-9 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="hidden h-3 w-56 rounded bg-zinc-200/70 sm:block dark:bg-zinc-800/70" />
          </div>
          <div className="h-6 w-24 rounded-full bg-zinc-100 dark:bg-zinc-900" />
        </div>
      </div>
      <div className="grid w-full grid-cols-1 items-start gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="animate-pulse rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex gap-3 border-b border-zinc-200 p-5 dark:border-zinc-800">
            <div className="h-9 w-9 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-3 w-3/4 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
            </div>
          </div>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-zinc-200 p-5 dark:border-zinc-800">
              <div className="h-6 w-6 rounded-full bg-zinc-100 dark:bg-zinc-900" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-3 w-2/3 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
              </div>
              <div className="h-9 w-32 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
            </div>
          ))}
          <div className="h-40 rounded-b-xl bg-zinc-50/60 dark:bg-zinc-900/30" />
        </div>
        <div className="h-96 animate-pulse rounded-xl border border-zinc-200 bg-white lg:col-start-2 lg:row-span-2 lg:row-start-1 dark:border-zinc-800 dark:bg-zinc-950" />
        <div className="animate-pulse space-y-6">
          <div className="h-64 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" />
          <div className="h-48 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" />
        </div>
      </div>
    </div>
  );
}
