import { useEffect, useMemo, useRef, useState } from "react";

type Block = {
  id: string;
  start: string;
  end: string;
  durationMin: number;
  bucket: string;
  note?: string;
};

type Claim = {
  id: string;
  tier: 1 | 2 | 3;
  rewardText: string;
  claimedAt: string;
  note?: string;
};

type TimerState = {
  isRunning: boolean;
  isPaused: boolean;
  durationSec: number;
  remainingSec: number;
  startedAt: string | null;
  presetLabel: string | null;
};

type PendingBlock = {
  id: string;
  start: string;
  end: string;
  durationSec: number;
};

type AppData = {
  version: number;
  settings: {
    weeklyQuota: number;
    monthlyTarget: number;
    buckets: string[];
    timeZone: string;
    tokenSource: "blocks" | "manual";
  };
  rewards: {
    tier1: string[];
    tier2: string[];
    tier3: string[];
    antiRewards: string[];
  };
  blocks: Block[];
  claims: Claim[];
  manualTokens: number;
  timerState: TimerState;
  pendingBlock: PendingBlock | null;
};

type TabKey = "timer" | "log" | "rewards" | "settings";

type LogView = "daily" | "weekly" | "monthly";

type ClaimDraft = {
  tier: 1 | 2 | 3;
  rewardText: string;
};

const STORAGE_KEY = "control-board";
const DEFAULT_BUCKETS = ["AI adoption", "Personal brand", "Other"];

const defaultData: AppData = {
  version: 1,
  settings: {
    weeklyQuota: 10,
    monthlyTarget: 40,
    buckets: DEFAULT_BUCKETS,
    timeZone: "Europe/Warsaw",
    tokenSource: "blocks",
  },
  rewards: {
    tier1: ["Coffee walk", "20 min social scroll", "Quick snack"],
    tier2: ["Dinner out", "Weekend outing"],
    tier3: ["Weekend retreat", "New learning course"],
    antiRewards: ["Mindless scrolling", "Random YouTube"]
  },
  blocks: [],
  claims: [],
  manualTokens: 0,
  timerState: {
    isRunning: false,
    isPaused: false,
    durationSec: 25 * 60,
    remainingSec: 25 * 60,
    startedAt: null,
    presetLabel: "25 min",
  },
  pendingBlock: null,
};

const pad = (value: number) => value.toString().padStart(2, "0");

const formatSeconds = (value: number) => {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${pad(minutes)}:${pad(seconds)}`;
};

const getZonedParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(lookup("year")),
    month: Number(lookup("month")),
    day: Number(lookup("day")),
    hour: Number(lookup("hour")),
    minute: Number(lookup("minute")),
    second: Number(lookup("second")),
  };
};

const toDateKey = (date: Date, timeZone: string) => {
  const { year, month, day } = getZonedParts(date, timeZone);
  return `${year}-${pad(month)}-${pad(day)}`;
};

const toMonthKey = (date: Date, timeZone: string) => {
  const { year, month } = getZonedParts(date, timeZone);
  return `${year}-${pad(month)}`;
};

const getZonedDate = (date: Date, timeZone: string) => {
  const { year, month, day } = getZonedParts(date, timeZone);
  return new Date(Date.UTC(year, month - 1, day));
};

const getWeekStart = (date: Date, timeZone: string) => {
  const zonedDate = getZonedDate(date, timeZone);
  const day = zonedDate.getUTCDay();
  const diff = (day + 6) % 7;
  const start = new Date(zonedDate);
  start.setUTCDate(zonedDate.getUTCDate() - diff);
  return start;
};

const isWithinWeek = (date: Date, weekStart: Date, timeZone: string) => {
  const zoned = getZonedDate(date, timeZone);
  const start = weekStart.getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  const value = zoned.getTime();
  return value >= start && value < end;
};

const getDaysInMonth = (date: Date, timeZone: string) => {
  const { year, month } = getZonedParts(date, timeZone);
  return new Date(year, month, 0).getDate();
};

const usePersistentData = () => {
  const [data, setData] = useState<AppData>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultData;
    }
    try {
      const parsed = JSON.parse(raw) as AppData;
      return { ...defaultData, ...parsed };
    } catch {
      return defaultData;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  return [data, setData] as const;
};

const StatusBar = ({
  todayBlocks,
  todayMinutes,
  tokens,
  weekBlocks,
  weeklyQuota,
}: {
  todayBlocks: number;
  todayMinutes: number;
  tokens: number;
  weekBlocks: number;
  weeklyQuota: number;
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 bg-white px-4 py-3 text-sm text-ink-700 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <span className="font-medium text-ink-900">Today</span>
        <span>{todayBlocks} blocks</span>
        <span>{todayMinutes} min</span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <span className="font-medium text-ink-900">Tier 1 tokens</span>
        <span>{tokens}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink-900">Week quota</span>
        <span>
          {weekBlocks}/{weeklyQuota} blocks
        </span>
      </div>
    </div>
  );
};

const TabButton = ({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
      active
        ? "bg-ink-900 text-white"
        : "bg-white text-ink-700 hover:bg-ink-100"
    }`}
  >
    {label}
  </button>
);

const Toast = ({ message }: { message: string }) => (
  <div
    className="pointer-events-none fixed bottom-6 right-6 rounded-full bg-ink-900 px-4 py-2 text-sm text-white shadow-lg"
    role="status"
    aria-live="polite"
  >
    {message}
  </div>
);

const RewardList = ({
  title,
  items,
  value,
  onValueChange,
  onAdd,
  onRemove,
  onClaim,
  canClaim,
}: {
  title: string;
  items: string[];
  value: string;
  onValueChange: (nextValue: string) => void;
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
  onClaim?: (item: string) => void;
  canClaim?: boolean;
}) => {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      </div>
      <ul className="mt-3 space-y-2">
        {items.length === 0 && (
          <li className="text-sm text-ink-500">No rewards yet.</li>
        )}
        {items.map((item, index) => (
          <li
            key={`${item}-${index}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-100 px-3 py-2 text-sm"
          >
            <span className="text-ink-800">{item}</span>
            <div className="flex items-center gap-2">
              {onClaim && (
                <button
                  type="button"
                  disabled={!canClaim}
                  onClick={() => onClaim(item)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    canClaim
                      ? "bg-ink-900 text-white hover:bg-ink-700"
                      : "cursor-not-allowed bg-ink-100 text-ink-400"
                  }`}
                >
                  Claim
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="rounded-full border border-ink-200 px-3 py-1 text-xs text-ink-600 hover:border-ink-400"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="Add a reward"
          className="w-full rounded-xl border border-ink-100 px-3 py-2 text-sm focus:border-ink-300 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            const trimmed = value.trim();
            if (!trimmed) {
              return;
            }
            onAdd(trimmed);
            onValueChange("");
          }}
          className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-700"
        >
          Add
        </button>
      </div>
    </div>
  );
};

const App = () => {
  const [data, setData] = usePersistentData();
  const [activeTab, setActiveTab] = useState<TabKey>("timer");
  const [logView, setLogView] = useState<LogView>("daily");
  const [customMinutes, setCustomMinutes] = useState(30);
  const [toast, setToast] = useState<string | null>(null);
  const [claimDraft, setClaimDraft] = useState<ClaimDraft | null>(null);
  const [claimNote, setClaimNote] = useState("");
  const [pendingBucket, setPendingBucket] = useState(
    data.settings.buckets[0] ?? ""
  );
  const [pendingNote, setPendingNote] = useState("");
  const [isLogging, setIsLogging] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [rewardDrafts, setRewardDrafts] = useState({
    tier1: "",
    tier2: "",
    tier3: "",
  });
  const [quickClaimReward, setQuickClaimReward] = useState(
    data.rewards.tier1[0] ?? ""
  );
  const completionLock = useRef(false);

  const timeZone = data.settings.timeZone;
  const todayKey = toDateKey(now, timeZone);
  const weekStart = getWeekStart(now, timeZone);
  const monthKey = toMonthKey(now, timeZone);

  const blocks = data.blocks;
  const claims = data.claims;

  const todayBlocks = blocks.filter((block) =>
    toDateKey(new Date(block.end), timeZone) === todayKey
  );
  const weekBlocks = blocks.filter((block) =>
    isWithinWeek(new Date(block.end), weekStart, timeZone)
  );
  const monthBlocks = blocks.filter((block) =>
    toMonthKey(new Date(block.end), timeZone) === monthKey
  );

  const todayMinutes = todayBlocks.reduce(
    (total, block) => total + block.durationMin,
    0
  );

  const weekMinutes = weekBlocks.reduce(
    (total, block) => total + block.durationMin,
    0
  );

  const monthMinutes = monthBlocks.reduce(
    (total, block) => total + block.durationMin,
    0
  );

  const tier1Claims = claims.filter((claim) => claim.tier === 1);
  const tier1Tokens = Math.max(
    0,
    (data.settings.tokenSource === "blocks" ? blocks.length : data.manualTokens) -
      tier1Claims.length
  );

  const weeklyQuotaReached = weekBlocks.length >= data.settings.weeklyQuota;
  const monthlyTargetReached =
    monthBlocks.length >= data.settings.monthlyTarget;

  const liveRemaining = useMemo(() => {
    const timer = data.timerState;
    if (!timer.isRunning) {
      return timer.remainingSec;
    }
    if (timer.isPaused) {
      return timer.remainingSec;
    }
    if (!timer.startedAt) {
      return timer.remainingSec;
    }
    const startedAt = new Date(timer.startedAt).getTime();
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    return Math.max(0, timer.remainingSec - elapsed);
  }, [data.timerState, now]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!data.timerState.isRunning || data.timerState.isPaused) {
      return;
    }
    if (liveRemaining <= 0) {
      handleTimerComplete();
    }
  }, [data.timerState.isRunning, data.timerState.isPaused, liveRemaining]);

  useEffect(() => {
    if (toast) {
      const timeout = window.setTimeout(() => setToast(null), 3000);
      return () => window.clearTimeout(timeout);
    }
  }, [toast]);

  useEffect(() => {
    if (data.pendingBlock) {
      setPendingBucket(data.settings.buckets[0] ?? "");
    }
  }, [data.pendingBlock, data.settings.buckets]);

  useEffect(() => {
    setQuickClaimReward((current) => {
      if (!current && data.rewards.tier1[0]) {
        return data.rewards.tier1[0];
      }
      if (current && !data.rewards.tier1.includes(current)) {
        return data.rewards.tier1[0] ?? "";
      }
      return current;
    });
  }, [data.rewards.tier1]);

  const handleTimerPreset = (minutes: number, label: string) => {
    if (data.timerState.isRunning) {
      return;
    }
    setData((prev) => ({
      ...prev,
      timerState: {
        ...prev.timerState,
        durationSec: minutes * 60,
        remainingSec: minutes * 60,
        presetLabel: label,
      },
    }));
  };

  const handleStart = () => {
    if (data.timerState.isRunning) {
      return;
    }
    completionLock.current = false;
    setData((prev) => ({
      ...prev,
      timerState: {
        ...prev.timerState,
        isRunning: true,
        isPaused: false,
        startedAt: new Date().toISOString(),
        remainingSec: prev.timerState.remainingSec,
      },
    }));
  };

  const handlePause = () => {
    if (!data.timerState.isRunning || data.timerState.isPaused) {
      return;
    }
    setData((prev) => ({
      ...prev,
      timerState: {
        ...prev.timerState,
        isPaused: true,
        remainingSec: liveRemaining,
      },
    }));
  };

  const handleResume = () => {
    if (!data.timerState.isRunning || !data.timerState.isPaused) {
      return;
    }
    completionLock.current = false;
    setData((prev) => ({
      ...prev,
      timerState: {
        ...prev.timerState,
        isPaused: false,
        startedAt: new Date().toISOString(),
      },
    }));
  };

  const handleCancel = () => {
    setData((prev) => ({
      ...prev,
      timerState: {
        ...prev.timerState,
        isRunning: false,
        isPaused: false,
        remainingSec: prev.timerState.durationSec,
        startedAt: null,
      },
      pendingBlock: null,
    }));
  };

  const handleTimerComplete = () => {
    if (completionLock.current) {
      return;
    }
    completionLock.current = true;
    const end = new Date();
    const durationSec = data.timerState.durationSec;
    const start = new Date(end.getTime() - durationSec * 1000);
    setData((prev) => ({
      ...prev,
      timerState: {
        ...prev.timerState,
        isRunning: false,
        isPaused: false,
        remainingSec: prev.timerState.durationSec,
        startedAt: null,
      },
      pendingBlock: {
        id: crypto.randomUUID(),
        start: start.toISOString(),
        end: end.toISOString(),
        durationSec,
      },
    }));
    setToast("Block completed. Tag it to log your focus.");
  };

  const handleLogBlock = () => {
    if (!data.pendingBlock || isLogging) {
      return;
    }
    setIsLogging(true);
    const pending = data.pendingBlock;
    const durationMin = Math.round(pending.durationSec / 60);
    const newBlock: Block = {
      id: pending.id,
      start: pending.start,
      end: pending.end,
      durationMin,
      bucket: pendingBucket,
      note: pendingNote.trim() || undefined,
    };
    setData((prev) => ({
      ...prev,
      blocks: [newBlock, ...prev.blocks],
      pendingBlock: null,
    }));
    setPendingNote("");
    setToast("Block logged. Tier 1 token earned.");
    window.setTimeout(() => setIsLogging(false), 300);
  };

  const handleClaim = () => {
    if (!claimDraft) {
      return;
    }
    const newClaim: Claim = {
      id: crypto.randomUUID(),
      tier: claimDraft.tier,
      rewardText: claimDraft.rewardText,
      claimedAt: new Date().toISOString(),
      note: claimNote.trim() || undefined,
    };
    setData((prev) => ({
      ...prev,
      claims: [newClaim, ...prev.claims],
    }));
    setClaimDraft(null);
    setClaimNote("");
    setToast("Reward claimed. Enjoy your break.");
  };

  const updateRewards = (tier: "tier1" | "tier2" | "tier3", value: string[]) => {
    setData((prev) => ({
      ...prev,
      rewards: {
        ...prev.rewards,
        [tier]: value,
      },
    }));
  };

  const updateRewardDraft = (
    tier: "tier1" | "tier2" | "tier3",
    value: string
  ) => {
    setRewardDrafts((prev) => ({
      ...prev,
      [tier]: value,
    }));
  };

  const handleManualTokenAdd = () => {
    if (data.settings.tokenSource !== "manual") {
      return;
    }
    setData((prev) => ({
      ...prev,
      manualTokens: prev.manualTokens + 1,
    }));
    setToast("Tier 1 token added.");
  };

  const handleQuickClaim = () => {
    if (!quickClaimReward.trim()) {
      setToast("Choose or type a Tier 1 reward first.");
      return;
    }
    if (tier1Tokens <= 0) {
      setToast("No Tier 1 tokens available.");
      return;
    }
    setClaimDraft({ tier: 1, rewardText: quickClaimReward });
  };

  const handleAddQuickClaimReward = () => {
    const trimmed = quickClaimReward.trim();
    if (!trimmed) {
      setToast("Type a reward to add.");
      return;
    }
    if (data.rewards.tier1.includes(trimmed)) {
      setToast("Reward already exists.");
      return;
    }
    updateRewards("tier1", [...data.rewards.tier1, trimmed]);
    setToast("Tier 1 reward added.");
  };

  const updateAntiRewards = (value: string[]) => {
    setData((prev) => ({
      ...prev,
      rewards: {
        ...prev.rewards,
        antiRewards: value,
      },
    }));
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "control-board-data.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (file: File | null) => {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as AppData;
        setData({ ...defaultData, ...parsed });
      } catch {
        setToast("Import failed. Check the file format.");
      }
    };
    reader.readAsText(file);
  };

  const handleResetMonth = () => {
    if (!window.confirm("Reset current month data? This cannot be undone.")) {
      return;
    }
    setData((prev) => ({
      ...prev,
      blocks: prev.blocks.filter(
        (block) => toMonthKey(new Date(block.end), timeZone) !== monthKey
      ),
      claims: prev.claims.filter(
        (claim) => toMonthKey(new Date(claim.claimedAt), timeZone) !== monthKey
      ),
      manualTokens: 0,
      pendingBlock: null,
    }));
  };

  const handleResetAll = () => {
    if (!window.confirm("Reset all data? This will erase everything.")) {
      return;
    }
    setData(defaultData);
  };

  const bucketCounts = weekBlocks.reduce<Record<string, number>>(
    (acc, block) => {
      acc[block.bucket] = (acc[block.bucket] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const monthDayCounts = useMemo(() => {
    const days = getDaysInMonth(now, timeZone);
    const counts = Array.from({ length: days }, () => 0);
    monthBlocks.forEach((block) => {
      const { day } = getZonedParts(new Date(block.end), timeZone);
      counts[day - 1] += 1;
    });
    return counts;
  }, [monthBlocks, now, timeZone]);

  const currentStreak = useMemo(() => {
    const days = getDaysInMonth(now, timeZone);
    let streak = 0;
    for (let i = days; i >= 1; i -= 1) {
      const date = new Date(now);
      const { year, month } = getZonedParts(date, timeZone);
      const test = new Date(Date.UTC(year, month - 1, i));
      const key = toDateKey(test, timeZone);
      const count = monthBlocks.filter(
        (block) => toDateKey(new Date(block.end), timeZone) === key
      ).length;
      if (count > 0) {
        streak += 1;
      } else if (key === todayKey) {
        break;
      } else if (streak > 0) {
        break;
      }
    }
    return streak;
  }, [monthBlocks, now, timeZone, todayKey]);

  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ink-500">
              Control Board
            </p>
            <h1 className="text-3xl font-semibold text-ink-900">
              Focused progress tracker with rewards
            </h1>
          </div>
          <nav className="flex flex-wrap gap-2">
            <TabButton
              active={activeTab === "timer"}
              label="Timer"
              onClick={() => setActiveTab("timer")}
            />
            <TabButton
              active={activeTab === "log"}
              label="Log"
              onClick={() => setActiveTab("log")}
            />
            <TabButton
              active={activeTab === "rewards"}
              label="Rewards"
              onClick={() => setActiveTab("rewards")}
            />
            <TabButton
              active={activeTab === "settings"}
              label="Settings"
              onClick={() => setActiveTab("settings")}
            />
          </nav>
          <StatusBar
            todayBlocks={todayBlocks.length}
            todayMinutes={todayMinutes}
            tokens={tier1Tokens}
            weekBlocks={weekBlocks.length}
            weeklyQuota={data.settings.weeklyQuota}
          />
        </header>

        {activeTab === "timer" && (
          <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-ink-900">Focused block</h2>
              <p className="mt-1 text-sm text-ink-500">
                Earn rewards only by completing full focus blocks.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleTimerPreset(25, "25 min")}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    data.timerState.durationSec === 25 * 60
                      ? "border-ink-900 bg-ink-900 text-white"
                      : "border-ink-100 bg-white text-ink-700 hover:border-ink-300"
                  }`}
                >
                  25 min
                </button>
                <button
                  type="button"
                  onClick={() => handleTimerPreset(45, "45 min")}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    data.timerState.durationSec === 45 * 60
                      ? "border-ink-900 bg-ink-900 text-white"
                      : "border-ink-100 bg-white text-ink-700 hover:border-ink-300"
                  }`}
                >
                  45 min
                </button>
                <div className="flex items-center gap-2 rounded-full border border-ink-100 bg-white px-3 py-2">
                  <label className="text-sm text-ink-500" htmlFor="custom-minutes">
                    Custom
                  </label>
                  <input
                    id="custom-minutes"
                    type="number"
                    min={5}
                    max={180}
                    value={customMinutes}
                    onChange={(event) =>
                      setCustomMinutes(Number(event.target.value))
                    }
                    className="w-16 bg-transparent text-sm font-semibold text-ink-900 focus:outline-none"
                    disabled={data.timerState.isRunning}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      handleTimerPreset(customMinutes, `${customMinutes} min`)
                    }
                    disabled={data.timerState.isRunning}
                    className="text-xs font-semibold text-ink-700 hover:text-ink-900"
                  >
                    Set
                  </button>
                </div>
              </div>

              <div className="mt-8 flex flex-col items-center gap-4">
                <div className="text-6xl font-semibold text-ink-900">
                  {formatSeconds(liveRemaining)}
                </div>
                <p className="text-sm text-ink-500">
                  Preset: {data.timerState.presetLabel ?? "Custom"}
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  {!data.timerState.isRunning && (
                    <button
                      type="button"
                      onClick={handleStart}
                      className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-white hover:bg-ink-700"
                    >
                      Start
                    </button>
                  )}
                  {data.timerState.isRunning && !data.timerState.isPaused && (
                    <button
                      type="button"
                      onClick={handlePause}
                      className="rounded-full border border-ink-300 px-5 py-2 text-sm font-semibold text-ink-700 hover:border-ink-500"
                    >
                      Pause
                    </button>
                  )}
                  {data.timerState.isRunning && data.timerState.isPaused && (
                    <button
                      type="button"
                      onClick={handleResume}
                      className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-white hover:bg-ink-700"
                    >
                      Resume
                    </button>
                  )}
                  {data.timerState.isRunning && (
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="rounded-full border border-ink-200 px-5 py-2 text-sm font-semibold text-ink-600 hover:border-ink-400"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-ink-900">Rules recap</h3>
              <ul className="mt-4 space-y-3 text-sm text-ink-600">
                <li className="rounded-xl border border-ink-100 px-3 py-2">
                  ✅ Rewards are granted only for completed focus blocks.
                </li>
                <li className="rounded-xl border border-ink-100 px-3 py-2">
                  ✅ Distractions are allowed only if you have Tier 1 tokens.
                </li>
                <li className="rounded-xl border border-ink-100 px-3 py-2">
                  ✅ Tier 2 unlocks at weekly quota. Tier 3 unlocks at monthly target.
                </li>
              </ul>
              <div className="mt-6 rounded-xl border border-ink-100 bg-ink-50 p-4 text-sm text-ink-600">
                <p className="font-semibold text-ink-900">Current week</p>
                <p>{weekBlocks.length} blocks • {weekMinutes} minutes</p>
                <p className="mt-2 text-ink-500">
                  Quota: {data.settings.weeklyQuota} blocks
                </p>
              </div>
            </div>
          </section>
        )}

        {activeTab === "log" && (
          <section className="grid gap-6">
            <div className="flex flex-wrap gap-2">
              <TabButton
                active={logView === "daily"}
                label="Daily"
                onClick={() => setLogView("daily")}
              />
              <TabButton
                active={logView === "weekly"}
                label="Weekly"
                onClick={() => setLogView("weekly")}
              />
              <TabButton
                active={logView === "monthly"}
                label="Monthly"
                onClick={() => setLogView("monthly")}
              />
            </div>

            {logView === "daily" && (
              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-ink-900">Today</h3>
                <p className="text-sm text-ink-500">
                  Completed blocks logged in Warsaw time.
                </p>
                <ul className="mt-4 space-y-3">
                  {todayBlocks.length === 0 && (
                    <li className="text-sm text-ink-500">
                      No completed blocks yet.
                    </li>
                  )}
                  {todayBlocks.map((block) => (
                    <li
                      key={block.id}
                      className="flex flex-col gap-2 rounded-xl border border-ink-100 px-4 py-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-ink-900">
                          {block.bucket}
                        </span>
                        <span className="text-ink-500">
                          {new Intl.DateTimeFormat("en-GB", {
                            timeZone,
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(block.end))}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-ink-600">
                        <span>{block.durationMin} min</span>
                        {block.note && <span>• {block.note}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {logView === "weekly" && (
              <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-ink-900">
                    Week summary
                  </h3>
                  <p className="text-sm text-ink-500">
                    Starting Monday in Warsaw time.
                  </p>
                  <div className="mt-4 grid gap-3 text-sm text-ink-700">
                    <div className="rounded-xl border border-ink-100 px-3 py-2">
                      Total blocks: {weekBlocks.length}
                    </div>
                    <div className="rounded-xl border border-ink-100 px-3 py-2">
                      Total minutes: {weekMinutes}
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-ink-900">
                    Bucket breakdown
                  </h3>
                  <ul className="mt-4 space-y-2 text-sm text-ink-600">
                    {Object.keys(bucketCounts).length === 0 && (
                      <li>No bucket data yet.</li>
                    )}
                    {Object.entries(bucketCounts).map(([bucket, count]) => (
                      <li
                        key={bucket}
                        className="flex items-center justify-between rounded-xl border border-ink-100 px-3 py-2"
                      >
                        <span>{bucket}</span>
                        <span className="font-semibold text-ink-900">
                          {count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {logView === "monthly" && (
              <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-ink-900">Monthly</h3>
                  <p className="text-sm text-ink-500">
                    Blocks and streaks in Warsaw time.
                  </p>
                  <div className="mt-4 grid gap-3 text-sm text-ink-700">
                    <div className="rounded-xl border border-ink-100 px-3 py-2">
                      Total blocks: {monthBlocks.length}
                    </div>
                    <div className="rounded-xl border border-ink-100 px-3 py-2">
                      Total minutes: {monthMinutes}
                    </div>
                    <div className="rounded-xl border border-ink-100 px-3 py-2">
                      Current streak: {currentStreak} days
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-ink-900">
                    Daily blocks chart
                  </h3>
                  <div className="mt-4 h-32">
                    <svg
                      viewBox={`0 0 ${monthDayCounts.length} 10`}
                      className="h-full w-full"
                      role="img"
                      aria-label="Blocks per day"
                    >
                      {monthDayCounts.map((count, index) => (
                        <rect
                          key={index}
                          x={index + 0.1}
                          y={10 - Math.min(10, count)}
                          width={0.8}
                          height={Math.min(10, count)}
                          rx={0.2}
                          fill={count > 0 ? "#2a3141" : "#e3e8ef"}
                        />
                      ))}
                    </svg>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === "rewards" && (
          <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="grid gap-6">
              <RewardList
                title={`Tier 1 rewards (tokens available: ${tier1Tokens})`}
                items={data.rewards.tier1}
                value={rewardDrafts.tier1}
                onValueChange={(value) => updateRewardDraft("tier1", value)}
                onAdd={(value) => updateRewards("tier1", [...data.rewards.tier1, value])}
                onRemove={(index) =>
                  updateRewards(
                    "tier1",
                    data.rewards.tier1.filter((_, i) => i !== index)
                  )
                }
                onClaim={(item) => setClaimDraft({ tier: 1, rewardText: item })}
                canClaim={tier1Tokens > 0}
              />
              <RewardList
                title={
                  weeklyQuotaReached
                    ? "Tier 2 rewards (unlocked)"
                    : "Tier 2 rewards (locked)"
                }
                items={data.rewards.tier2}
                value={rewardDrafts.tier2}
                onValueChange={(value) => updateRewardDraft("tier2", value)}
                onAdd={(value) => updateRewards("tier2", [...data.rewards.tier2, value])}
                onRemove={(index) =>
                  updateRewards(
                    "tier2",
                    data.rewards.tier2.filter((_, i) => i !== index)
                  )
                }
                onClaim={(item) => setClaimDraft({ tier: 2, rewardText: item })}
                canClaim={weeklyQuotaReached}
              />
              <RewardList
                title={
                  monthlyTargetReached
                    ? "Tier 3 rewards (unlocked)"
                    : "Tier 3 rewards (locked)"
                }
                items={data.rewards.tier3}
                value={rewardDrafts.tier3}
                onValueChange={(value) => updateRewardDraft("tier3", value)}
                onAdd={(value) => updateRewards("tier3", [...data.rewards.tier3, value])}
                onRemove={(index) =>
                  updateRewards(
                    "tier3",
                    data.rewards.tier3.filter((_, i) => i !== index)
                  )
                }
                onClaim={(item) => setClaimDraft({ tier: 3, rewardText: item })}
                canClaim={monthlyTargetReached}
              />
            </div>
            <div className="grid gap-6">
              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-ink-900">
                  Tier 1 token controls
                </h3>
                <p className="text-sm text-ink-500">
                  Source:{" "}
                  {data.settings.tokenSource === "blocks"
                    ? "Earned per completed block"
                    : "Manual button"}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink-700">
                  <span className="rounded-full border border-ink-100 px-3 py-1">
                    Tokens available: {tier1Tokens}
                  </span>
                  <span className="rounded-full border border-ink-100 px-3 py-1">
                    Claims: {tier1Claims.length}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="flex min-w-[220px] flex-1 items-center gap-2">
                    <input
                      list="tier1-rewards"
                      value={quickClaimReward}
                      onChange={(event) => setQuickClaimReward(event.target.value)}
                      placeholder="Choose or type a Tier 1 reward"
                      className="w-full rounded-xl border border-ink-100 px-3 py-2 text-sm focus:border-ink-300 focus:outline-none"
                    />
                    <datalist id="tier1-rewards">
                      {data.rewards.tier1.map((reward) => (
                        <option key={reward} value={reward} />
                      ))}
                    </datalist>
                    <button
                      type="button"
                      onClick={handleAddQuickClaimReward}
                      className="rounded-xl border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-700 hover:border-ink-400"
                    >
                      Add
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleQuickClaim}
                    className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-700"
                  >
                    Claim
                  </button>
                </div>
                {data.settings.tokenSource === "manual" && (
                  <button
                    type="button"
                    onClick={handleManualTokenAdd}
                    className="mt-4 rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-700"
                  >
                    Add Tier 1 token
                  </button>
                )}
              </div>
              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-ink-900">Anti reward list</h3>
                <p className="text-sm text-ink-500">
                  Distractions only allowed if you have Tier 1 tokens.
                </p>
                <div className="mt-3 rounded-xl border border-ink-100 bg-ink-50 px-3 py-2 text-sm text-ink-700">
                  Tokens remaining: {tier1Tokens}
                </div>
                <ul className="mt-4 space-y-2 text-sm text-ink-600">
                  {data.rewards.antiRewards.length === 0 && (
                    <li>No distractions listed.</li>
                  )}
                  {data.rewards.antiRewards.map((item, index) => (
                    <li
                      key={`${item}-${index}`}
                      className="flex items-center justify-between rounded-xl border border-ink-100 px-3 py-2"
                    >
                      <span>{item}</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateAntiRewards(
                            data.rewards.antiRewards.filter((_, i) => i !== index)
                          )
                        }
                        className="rounded-full border border-ink-200 px-3 py-1 text-xs text-ink-600"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    placeholder="Add distraction"
                    className="w-full rounded-xl border border-ink-100 px-3 py-2 text-sm focus:border-ink-300 focus:outline-none"
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") {
                        return;
                      }
                      const target = event.target as HTMLInputElement;
                      const value = target.value.trim();
                      if (!value) {
                        return;
                      }
                      updateAntiRewards([...data.rewards.antiRewards, value]);
                      target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={(event) => {
                      const input =
                        event.currentTarget
                          .previousElementSibling as HTMLInputElement | null;
                      if (!input) {
                        return;
                      }
                      const value = input.value.trim();
                      if (!value) {
                        return;
                      }
                      updateAntiRewards([...data.rewards.antiRewards, value]);
                      input.value = "";
                    }}
                    className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-700"
                  >
                    Add
                  </button>
                </div>
              </div>
              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-ink-900">Claim history</h3>
                <ul className="mt-4 space-y-2 text-sm text-ink-600">
                  {claims.length === 0 && <li>No claimed rewards yet.</li>}
                  {claims.slice(0, 6).map((claim) => (
                    <li
                      key={claim.id}
                      className="rounded-xl border border-ink-100 px-3 py-2"
                    >
                      <p className="font-semibold text-ink-900">
                        Tier {claim.tier}: {claim.rewardText}
                      </p>
                      <p className="text-xs text-ink-500">
                        {new Intl.DateTimeFormat("en-GB", {
                          timeZone,
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(claim.claimedAt))}
                      </p>
                      {claim.note && <p className="text-xs">{claim.note}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-ink-900">Settings</h3>
              <div className="mt-4 grid gap-4 text-sm text-ink-700">
                <label className="flex flex-col gap-2">
                  Weekly minimum blocks quota
                  <input
                    type="number"
                    min={1}
                    value={data.settings.weeklyQuota}
                    onChange={(event) =>
                      setData((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          weeklyQuota: Number(event.target.value),
                        },
                      }))
                    }
                    className="rounded-xl border border-ink-100 px-3 py-2 focus:border-ink-300 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  Monthly blocks target
                  <input
                    type="number"
                    min={1}
                    value={data.settings.monthlyTarget}
                    onChange={(event) =>
                      setData((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          monthlyTarget: Number(event.target.value),
                        },
                      }))
                    }
                    className="rounded-xl border border-ink-100 px-3 py-2 focus:border-ink-300 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  Tier 1 token source
                  <select
                    value={data.settings.tokenSource}
                    onChange={(event) =>
                      setData((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          tokenSource: event.target.value as "blocks" | "manual",
                        },
                      }))
                    }
                    className="rounded-xl border border-ink-100 px-3 py-2 focus:border-ink-300 focus:outline-none"
                  >
                    <option value="blocks">Earn per completed block</option>
                    <option value="manual">Manual button</option>
                  </select>
                </label>
                <div>
                  <p className="font-semibold text-ink-900">Buckets</p>
                  <p className="text-xs text-ink-500">
                    Used for meaningful work tagging.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {data.settings.buckets.map((bucket, index) => (
                      <li
                        key={`${bucket}-${index}`}
                        className="flex items-center justify-between rounded-xl border border-ink-100 px-3 py-2"
                      >
                        <span>{bucket}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setData((prev) => ({
                              ...prev,
                              settings: {
                                ...prev.settings,
                                buckets: prev.settings.buckets.filter(
                                  (_, i) => i !== index
                                ),
                              },
                            }))
                          }
                          className="rounded-full border border-ink-200 px-3 py-1 text-xs text-ink-600"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      placeholder="Add bucket"
                      className="w-full rounded-xl border border-ink-100 px-3 py-2 focus:border-ink-300 focus:outline-none"
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") {
                          return;
                        }
                        const target = event.target as HTMLInputElement;
                        const value = target.value.trim();
                        if (!value) {
                          return;
                        }
                        setData((prev) => ({
                          ...prev,
                          settings: {
                            ...prev.settings,
                            buckets: [...prev.settings.buckets, value],
                          },
                        }));
                        target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={(event) => {
                        const input =
                          event.currentTarget
                            .previousElementSibling as HTMLInputElement | null;
                        if (!input) {
                          return;
                        }
                        const value = input.value.trim();
                        if (!value) {
                          return;
                        }
                        setData((prev) => ({
                          ...prev,
                          settings: {
                            ...prev.settings,
                            buckets: [...prev.settings.buckets, value],
                          },
                        }));
                        input.value = "";
                      }}
                      className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-700"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-6">
              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-ink-900">
                  Data management
                </h3>
                <div className="mt-4 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleExport}
                    className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:border-ink-400"
                  >
                    Export JSON
                  </button>
                  <label className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:border-ink-400">
                    Import JSON
                    <input
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={(event) =>
                        handleImport(event.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleResetMonth}
                    className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-700 hover:border-amber-500"
                  >
                    Reset month
                  </button>
                  <button
                    type="button"
                    onClick={handleResetAll}
                    className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:border-red-500"
                  >
                    Reset all
                  </button>
                </div>
              </div>
              <div className="rounded-2xl border border-ink-100 bg-white p-6 text-sm text-ink-600 shadow-sm">
                <h3 className="text-lg font-semibold text-ink-900">Offline first</h3>
                <p className="mt-2">
                  All data is stored locally in your browser using localStorage.
                </p>
              </div>
            </div>
          </section>
        )}
      </div>

      {data.pendingBlock && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-ink-900">
              Tag completed block
            </h3>
            <p className="text-sm text-ink-500">
              Choose a bucket and add an optional note.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <label className="text-sm font-semibold text-ink-700">
                Bucket
                <select
                  value={pendingBucket}
                  onChange={(event) => setPendingBucket(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-ink-100 px-3 py-2 text-sm focus:border-ink-300 focus:outline-none"
                >
                  {data.settings.buckets.map((bucket) => (
                    <option key={bucket} value={bucket}>
                      {bucket}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-ink-700">
                Optional note
                <textarea
                  value={pendingNote}
                  onChange={(event) => setPendingNote(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-ink-100 px-3 py-2 text-sm focus:border-ink-300 focus:outline-none"
                  rows={3}
                />
              </label>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleLogBlock}
                disabled={isLogging}
                className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-white hover:bg-ink-700"
              >
                Log block
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-full border border-ink-200 px-5 py-2 text-sm font-semibold text-ink-600"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {claimDraft && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-ink-900">Claim reward</h3>
            <p className="text-sm text-ink-500">{claimDraft.rewardText}</p>
            <label className="mt-4 block text-sm font-semibold text-ink-700">
              Optional note
              <textarea
                value={claimNote}
                onChange={(event) => setClaimNote(event.target.value)}
                className="mt-2 w-full rounded-xl border border-ink-100 px-3 py-2 text-sm focus:border-ink-300 focus:outline-none"
                rows={3}
              />
            </label>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleClaim}
                className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-white hover:bg-ink-700"
              >
                Confirm claim
              </button>
              <button
                type="button"
                onClick={() => {
                  setClaimDraft(null);
                  setClaimNote("");
                }}
                className="rounded-full border border-ink-200 px-5 py-2 text-sm font-semibold text-ink-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
};

export default App;
