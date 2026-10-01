import Link from "next/link";

const TABS = [
  { key: "commands", href: "/commands", label: "Commands" },
  { key: "comments", href: "/comments", label: "User comments" },
] as const;

// Switches between the scraper's two pages; in the header of both. On a phone it takes its own row.
export default function PageTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav
      aria-label="Scraper pages"
      className="order-last flex w-full gap-1 rounded-lg bg-zinc-100 p-1 sm:order-none sm:w-auto dark:bg-zinc-900"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={`flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-zinc-400 sm:flex-none ${
            tab.key === active
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
