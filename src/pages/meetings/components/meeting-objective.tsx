import { MeetingDetail } from "../mock-data";

const tagStyles = [
  "bg-accent-100 text-accent-700",
  "bg-primary-100 text-primary-700",
  "bg-success-100 text-success-700",
  "bg-warning-100 text-warning-700",
];

export function MeetingObjective({ meeting }: { meeting: MeetingDetail }) {
  return (
    <div className="intro-y bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-5 flex flex-col max-h-[60vh] transition-shadow duration-300 hover:shadow-xl">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Notes</h2>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
      {/* Tags */}
      <div className="mt-4 flex flex-wrap gap-2">
        {meeting.tags.map((tag, i) => (
          <span
            key={tag}
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              tagStyles[i % tagStyles.length]
            }`}
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Objective */}
      <div className="mt-4 rounded-xl bg-gradient-to-br from-primary-50 to-secondary-50 dark:from-slate-700 dark:to-slate-700 p-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          Objective
          <span className="w-1.5 h-1.5 rounded-full bg-secondary-400" />
        </h3>
        <div className="mt-2 flex items-start gap-2">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-success-400 flex-shrink-0" />
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {meeting.objective}
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
