"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { StateNotice } from "./StateNotice";

export function AsyncData<T>({ path, children, emptyTitle = "No canonical records yet", poll = 0 }: {
  path: string;
  children: (data: T) => ReactNode;
  emptyTitle?: string;
  poll?: number;
}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const load = () => api<T>(path).then((value) => current && setData(value)).catch((cause) => current && setError(cause.message));
    void load();
    const timer = poll ? setInterval(load, poll) : null;
    return () => { current = false; if (timer) clearInterval(timer); };
  }, [path, poll]);

  if (error) return <StateNotice state="not_available" title="Data service unavailable">{error}. No cached or fabricated records are shown.</StateNotice>;
  if (!data) return <div className="loading-line"><span />Reading canonical records…</div>;
  const state = (data as { state?: string }).state;
  if (state && state !== "live") return <StateNotice state={state} title={emptyTitle}>The indexer has not produced a verified record for this view.</StateNotice>;
  return <>{children(data)}</>;
}
