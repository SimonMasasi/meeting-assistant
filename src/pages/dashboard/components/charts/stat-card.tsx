import React from "react";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";

export interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactElement;
  iconBg?: string;
  iconColor?: string;
  change?: number;
  changeLabel?: string;
  footer?: string;
}

export function StatCard(props: StatCardProps) {
  const isPositive = (props.change ?? 0) >= 0;
  const hasChange = props.change !== undefined;

  return (
    <div className="min-w-0 break-words bg-white dark:bg-slate-800 shadow-lg dark:shadow-dark-xl rounded-2xl bg-clip-border hover:shadow-xl transition-shadow duration-200">
      <div className="flex-auto p-5">
        {/* Top row: label + icon */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {props.title}
            </p>
            <h3 className="text-3xl font-bold text-slate-800 dark:text-slate-100 leading-tight">
              {props.value}
            </h3>
          </div>
          <div
            className={`flex-shrink-0 ml-4 inline-flex items-center justify-center w-14 h-14 rounded-xl shadow-md ${props.iconBg ?? "bg-gradient-to-br from-blue-400 to-blue-600"}`}
          >
            <span className={`flex items-center justify-center text-white text-2xl ${props.iconColor ?? ""}`}>
              {props.icon}
            </span>
          </div>
        </div>

        {/* Bottom row: change badge + footer */}
        {(hasChange || props.footer) && (
          <div className="mt-4 flex items-center gap-2">
            {hasChange && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                  isPositive
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                }`}
              >
                {isPositive ? (
                  <TrendingUpIcon fontSize="inherit" />
                ) : (
                  <TrendingDownIcon fontSize="inherit" />
                )}
                {Math.abs(props.change!)}%
              </span>
            )}
            {props.changeLabel && (
              <span className="text-xs text-slate-400 dark:text-slate-500">{props.changeLabel}</span>
            )}
            {props.footer && !props.changeLabel && (
              <span className="text-xs text-slate-400 dark:text-slate-500">{props.footer}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
