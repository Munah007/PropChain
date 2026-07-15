"use client";

// Thumb-reachable primary navigation: two tabs, the raised create action dead
// centre, then two more — My Bets, Claim (badged with waiting payouts), and
// Account.

export type Tab = "matches" | "bets" | "claim" | "account";

function Grid({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function Ticket({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 6 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-6Z" />
      <path d="M12 7v10" strokeDasharray="1.5 2.5" />
    </svg>
  );
}

function Coins({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
      <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  );
}

function Person({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  );
}

export function BottomNav({
  tab,
  onTab,
  onCreate,
  claimable,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  onCreate: () => void;
  claimable: number;
}) {
  const item = (t: Tab, label: string, icon: React.ReactNode, badge?: number) => (
    <button
      onClick={() => onTab(t)}
      className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold transition ${
        tab === t ? "text-over" : "text-ink-3 hover:text-ink-2"
      }`}
      aria-current={tab === t ? "page" : undefined}
    >
      {icon}
      {label}
      {badge ? (
        <span className="absolute right-[calc(50%-22px)] top-1 grid min-w-4 place-items-center rounded-full bg-good px-1 text-[9px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-2xl items-center px-2 pb-[env(safe-area-inset-bottom)]">
        {item("matches", "Matches", <Grid active={tab === "matches"} />)}
        {item("bets", "My Bets", <Ticket active={tab === "bets"} />)}

        <div className="flex flex-1 justify-center">
          <button
            onClick={onCreate}
            className="-mt-6 grid size-14 place-items-center rounded-2xl bg-over text-white shadow-[0_10px_28px_rgba(57,135,229,0.45)] transition hover:brightness-110 active:scale-95"
            aria-label="Open a market"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {item("claim", "Claim", <Coins active={tab === "claim"} />, claimable)}
        {item("account", "Account", <Person active={tab === "account"} />)}
      </div>
    </nav>
  );
}
