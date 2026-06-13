import { useAtomValue } from "jotai";
import { themeAtom } from "@/atoms/shared-atoms";

export interface ChartTheme {
  axisLine: string;
  splitLine: string;
  axisLabel: string;
  legendText: string;
  border: string;
  centerText: string;
  centerSubText: string;
}

const lightChartTheme: ChartTheme = {
  axisLine: "#e0e0e0",
  splitLine: "#f0f0f0",
  axisLabel: "#6b7280",
  legendText: "#374151",
  border: "#ffffff",
  centerText: "#374151",
  centerSubText: "#9ca3af",
};

const darkChartTheme: ChartTheme = {
  axisLine: "#334155", // slate-700
  splitLine: "#1e293b", // slate-800
  axisLabel: "#94a3b8", // slate-400
  legendText: "#cbd5e1", // slate-300
  border: "#1e293b", // slate-800 (matches card background)
  centerText: "#e2e8f0", // slate-200
  centerSubText: "#94a3b8", // slate-400
};

/**
 * Returns chart colors for the active theme. Reads the shared `themeAtom`, so
 * charts re-render and recolor automatically when the user toggles dark mode.
 */
export function useChartTheme(): ChartTheme {
  const isDark = useAtomValue(themeAtom) === "dark";
  return isDark ? darkChartTheme : lightChartTheme;
}
