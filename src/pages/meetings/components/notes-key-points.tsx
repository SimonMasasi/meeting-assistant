import { useState } from "react";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { ActionItem, MeetingDetail } from "../mock-data";

export function NotesKeyPoints({ meeting }: { meeting: MeetingDetail }) {
  const [items, setItems] = useState<ActionItem[]>(meeting.actionItems);

  const completed = items.filter((i) => i.done).length;
  const progress = Math.round((completed / items.length) * 100);

  const toggle = (id: string) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i))
    );

  return (
    <div className="space-y-4">
      {/* Section heading */}
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
        <PushPinOutlinedIcon sx={{ fontSize: 18 }} className="text-slate-500 dark:text-slate-400" />
        <h2 className="text-base font-bold">Notes &amp; Key Points</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Summary + key points */}
        <div className="lg:col-span-3 relative bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-5 flex flex-col overflow-hidden max-h-[70vh]">
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Summary</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {meeting.summary}
              </p>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Key Points</h3>
              <ul className="mt-2 space-y-2">
                {meeting.keyPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <AutoAwesomeIcon
                      sx={{ fontSize: 16 }}
                      className="mt-0.5 text-accent-500 flex-shrink-0"
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* AI status pill */}
          <div className="mt-5 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-gradient-to-r from-secondary-500 to-accent-500 shadow">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              AI Summarizing
            </span>
            <button
              aria-label="Regenerate summary"
              className="flex items-center justify-center w-9 h-9 rounded-full bg-white dark:bg-slate-800 shadow hover:shadow-md text-accent-500 transition-shadow"
            >
              <LightbulbOutlinedIcon sx={{ fontSize: 20 }} />
            </button>
          </div>
        </div>

        {/* Action items */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-5 flex flex-col max-h-[70vh]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Action Items</h3>
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
              {completed}/{items.length}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary-400 to-secondary-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <ul className="mt-4 space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => toggle(item.id)}
                  className="flex items-center gap-2.5 w-full text-left group"
                >
                  {item.done ? (
                    <CheckCircleIcon
                      sx={{ fontSize: 20 }}
                      className="text-success-500 flex-shrink-0"
                    />
                  ) : (
                    <RadioButtonUncheckedIcon
                      sx={{ fontSize: 20 }}
                      className="text-slate-300 dark:text-slate-600 group-hover:text-slate-400 flex-shrink-0"
                    />
                  )}
                  <span
                    className={`text-sm ${
                      item.done
                        ? "line-through text-slate-400 dark:text-slate-500"
                        : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <button className="mt-4 w-full py-2.5 rounded-xl border border-primary-200 text-primary-600 text-sm font-semibold hover:bg-primary-50 transition-colors">
            Assign Tasks
          </button>
        </div>
      </div>
    </div>
  );
}
