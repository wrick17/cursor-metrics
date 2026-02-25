import { useState, useEffect, useCallback } from "react";

interface UsageData {
  includedRequests: { used: number; limit: number };
  onDemand: { spendDollars: number; limitDollars: number };
  resetsAt: string;
}

function formatResetDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ProgressBar({ ratio }: { ratio: number }) {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  return (
    <div className="w-full h-1 bg-white/10 rounded-full mt-4">
      <div
        className="h-full bg-white/40 rounded-full transition-all duration-700"
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}

export function UsageDashboard() {
  const [data, setData] = useState<UsageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/cursor/usage")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-screen px-8">
        <p className="text-white/30 font-mono text-sm">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen px-8">
        <p className="text-white/20 text-lg">Loading...</p>
      </div>
    );
  }

  const { includedRequests, onDemand, resetsAt } = data;

  return (
    <div className="flex flex-col justify-center min-h-screen w-full max-w-5xl mx-auto px-8 py-16 md:px-16 gap-16 md:gap-24">
      <section>
        <p className="text-white/40 text-sm md:text-base font-medium tracking-widest uppercase">
          Included-Request Usage
        </p>
        <p className="text-white text-6xl md:text-8xl lg:text-9xl font-bold mt-3 tabular-nums leading-none">
          {includedRequests.used}
          <span className="text-white/20 font-normal"> / {includedRequests.limit}</span>
        </p>
        <ProgressBar ratio={includedRequests.used / includedRequests.limit} />
        <p className="text-white/25 text-sm md:text-base mt-4">
          Usage included in your plan &middot; Resets {formatResetDate(resetsAt)}
        </p>
      </section>

      <section>
        <p className="text-white/40 text-sm md:text-base font-medium tracking-widest uppercase">
          On-Demand Usage
        </p>
        <p className="text-white text-6xl md:text-8xl lg:text-9xl font-bold mt-3 tabular-nums leading-none">
          ${onDemand.spendDollars.toFixed(2)}
          <span className="text-white/20 font-normal"> / ${onDemand.limitDollars}</span>
        </p>
        <ProgressBar ratio={onDemand.spendDollars / onDemand.limitDollars} />
        <p className="text-white/25 text-sm md:text-base mt-4">
          Pay for extra usage beyond your plan limits &middot; ${onDemand.limitDollars.toFixed(2)} per user
        </p>
      </section>
    </div>
  );
}
