import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import GroupsIcon from "@mui/icons-material/Groups";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import MicIcon from "@mui/icons-material/Mic";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ChecklistIcon from "@mui/icons-material/Checklist";
import TimerIcon from "@mui/icons-material/Timer";
import { StatCard } from "./components/charts/stat-card";
import { LineChart } from "./components/charts/line-chart";
import { BarChart } from "./components/charts/bar-chart";
import { DonutChart } from "./components/charts/donut-chart";
import { PieChart } from "./components/charts/pie-chart";
import { RecentMeetingsTable } from "./components/recent-meetings-table";
import { ChartCard } from "./components/chart-card";
import { DashboardStats, getDashboardStats } from "@/services/dashboard";

/** Whole-number minutes from seconds. */
function minutes(secs: number): number {
  return Math.round(secs / 60);
}

/** "Xh Ym" / "Ym" from seconds, for the recorded-time card. */
function formatHours(secs: number): string {
  const total = Math.round(secs / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function DashboardMain() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((err) => {
        console.error("Failed to load dashboard stats", err);
        toast.error("Could not load dashboard");
      });
  }, []);

  // Derived chart inputs (empty-safe while loading).
  const talkTime = stats?.talkTime ?? [];
  const typeBreakdown = stats?.typeBreakdown ?? [];
  const overTime = stats?.meetingsOverTime ?? { categories: [], data: [] };
  const weekday = stats?.meetingsByWeekday ?? [0, 0, 0, 0, 0, 0, 0];
  const actionTotal =
    (stats?.openActionItems ?? 0) + (stats?.doneActionItems ?? 0);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Meeting Assistant
        </h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
          Your local meeting activity
        </p>
      </div>

      {/* Row 1 — Stat Cards (all real, locally-derived) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard
          title="Total Meetings"
          value={stats?.totalMeetings ?? 0}
          icon={<GroupsIcon fontSize="inherit" />}
          iconBg="bg-gradient-to-br from-blue-400 to-blue-600"
        />
        <StatCard
          title="Recorded Sessions"
          value={stats?.recordedSessions ?? 0}
          icon={<MicIcon fontSize="inherit" />}
          iconBg="bg-gradient-to-br from-pink-400 to-pink-600"
        />
        <StatCard
          title="Total Recorded"
          value={formatHours(stats?.totalRecordedSecs ?? 0)}
          icon={<AccessTimeIcon fontSize="inherit" />}
          iconBg="bg-gradient-to-br from-purple-400 to-purple-600"
        />
        <StatCard
          title="Summarized"
          value={stats?.summarizedMeetings ?? 0}
          icon={<AutoAwesomeIcon fontSize="inherit" />}
          iconBg="bg-gradient-to-br from-amber-400 to-amber-600"
        />
      </div>

      {/* Row 2 — Meetings over time + meeting type breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <ChartCard title="Meetings Over Time">
            <LineChart
              categories={overTime.categories}
              series={[{ name: "Meetings", data: overTime.data }]}
              height="280px"
              colors={["#5470c6"]}
              showLegend={false}
            />
          </ChartCard>
        </div>
        <div className="lg:col-span-1">
          <ChartCard title="Meeting Type">
            <DonutChart
              name="Meeting Types"
              data={typeBreakdown}
              height="280px"
              centerText={String(stats?.totalMeetings ?? 0)}
              centerSubText="Meetings"
              colors={["#5470c6", "#91cc75"]}
            />
          </ChartCard>
        </div>
      </div>

      {/* Row 3 — Talk-time per speaker + meetings by day of week */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Talk Time by Speaker (minutes)">
          <BarChart
            categories={talkTime.map((t) => t.speaker)}
            series={[
              { name: "Minutes", data: talkTime.map((t) => minutes(t.seconds)) },
            ]}
            height="280px"
            horizontal
            colors={["#73c0de"]}
            showLegend={false}
          />
        </ChartCard>
        <ChartCard title="Meetings by Day of Week">
          <BarChart
            categories={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
            series={[{ name: "Meetings", data: weekday }]}
            height="280px"
            colors={["#91cc75"]}
            showLegend={false}
          />
        </ChartCard>
      </div>

      {/* Row 4 — Action items: progress pie + KPI cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1">
          <ChartCard title="Action Items">
            <PieChart
              data={[
                { name: "Open", value: stats?.openActionItems ?? 0 },
                { name: "Done", value: stats?.doneActionItems ?? 0 },
              ]}
              width="100%"
              height="280px"
              showLabels={true}
              labelsPosition="outside"
              showLabelLine={true}
              outerRadiusPercentage="75%"
              innerRadiusPercentage="0%"
              colors={["#fac858", "#3ba272"]}
            />
          </ChartCard>
        </div>
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-5 content-start">
          <StatCard
            title="Open Action Items"
            value={stats?.openActionItems ?? 0}
            icon={<ChecklistIcon fontSize="inherit" />}
            iconBg="bg-gradient-to-br from-orange-400 to-orange-600"
          />
          <StatCard
            title="Completed Items"
            value={stats?.doneActionItems ?? 0}
            icon={<ChecklistIcon fontSize="inherit" />}
            iconBg="bg-gradient-to-br from-teal-400 to-teal-600"
            footer={actionTotal > 0 ? `${actionTotal} total` : undefined}
          />
          <StatCard
            title="Avg. Recording"
            value={`${minutes(stats?.avgRecordingSecs ?? 0)} min`}
            icon={<TimerIcon fontSize="inherit" />}
            iconBg="bg-gradient-to-br from-indigo-400 to-indigo-600"
          />
        </div>
      </div>

      {/* Row 5 — Recent Meetings Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg dark:shadow-dark-xl overflow-hidden">
        <RecentMeetingsTable />
      </div>
    </div>
  );
}
