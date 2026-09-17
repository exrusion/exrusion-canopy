export function StateNotice({ state = "not_indexed", title, children }: { state?: string; title: string; children: React.ReactNode }) {
  return (
    <div className="state-notice">
      <div className="state-icon">{state === "live" ? "●" : "○"}</div>
      <div><span className={`state-label ${state}`}>{state.replaceAll("_", " ")}</span><h3>{title}</h3><p>{children}</p></div>
    </div>
  );
}
