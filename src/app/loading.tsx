// Skeleton that mirrors the dashboard layout, so the page appears to fill in
// rather than jump: sidebar shell, sticky search bar, then table rows.
export default function Loading() {
  return (
    <div className="flex min-h-dvh w-full" aria-busy="true" aria-label="Loading data">
      {/* sidebar shell (desktop only, like the real one) */}
      <aside className="hidden w-72 shrink-0 border-r border-zinc-200 lg:block dark:border-zinc-800">
        <div className="animate-pulse px-5 py-5">
          <div className="h-4 w-36 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="mt-2 h-3 w-24 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
        </div>
        <div className="animate-pulse px-5 pb-4">
          <div className="h-14 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
        </div>
        <div className="animate-pulse space-y-2 px-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-9 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="border-b border-zinc-200 px-4 py-3 sm:px-6 dark:border-zinc-800">
          <div className="flex animate-pulse items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-zinc-100 lg:hidden dark:bg-zinc-900" />
            <div className="h-9 flex-1 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
            <div className="hidden h-9 w-20 rounded-lg bg-zinc-100 sm:block dark:bg-zinc-900" />
          </div>
          <div className="mt-2 flex animate-pulse items-center justify-between">
            <div className="h-3 w-24 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
            <div className="h-3 w-28 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
          </div>
        </div>

        <div className="px-4 py-5 sm:px-6">
          {/* the Filters and Customize buttons */}
          <div className="mb-3 flex animate-pulse items-center justify-between">
            <div className="h-8 w-24 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
            <div className="h-8 w-28 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {/* compact rows with every column, the table's default look */}
            <div className="h-8 animate-pulse bg-zinc-50 dark:bg-zinc-900" />
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex animate-pulse items-center gap-4 bg-white px-4 py-1.5 dark:bg-zinc-950">
                  <div className="h-4 w-4 shrink-0 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="hidden h-5 w-20 shrink-0 rounded-full bg-zinc-100 sm:block dark:bg-zinc-900" />
                  <div
                    className="h-4 flex-1 rounded bg-zinc-100 dark:bg-zinc-900"
                    style={{ maxWidth: `${45 + ((i * 13) % 40)}%` }}
                  />
                  {/* Source and Details */}
                  <div className="hidden h-5 w-28 shrink-0 rounded-full bg-zinc-100 sm:block dark:bg-zinc-900" />
                  <div className="hidden h-3 w-32 shrink-0 rounded bg-zinc-100 sm:block dark:bg-zinc-900" />
                  <div className="ml-auto flex shrink-0 gap-1.5">
                    <div className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
                    <div className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
                    <div className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
