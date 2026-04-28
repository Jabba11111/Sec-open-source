import type { ReactNode } from "react";

export function Card({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-lg shadow-sm">
      {(title || actions) && (
        <header className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          {title && <h2 className="font-semibold text-slate-800">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
