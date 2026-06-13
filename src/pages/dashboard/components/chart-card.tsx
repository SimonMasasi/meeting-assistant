export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg dark:shadow-dark-xl p-5 flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h2>
      <div className="flex-1">{children}</div>
    </div>
  );
}