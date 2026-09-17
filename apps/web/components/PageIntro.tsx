export function PageIntro({ eyebrow, title, children, action }: { eyebrow: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="page-intro content-width">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{children}</p></div>{action}
    </section>
  );
}
