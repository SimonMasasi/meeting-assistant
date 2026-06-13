import GroupsIcon from "@mui/icons-material/Groups";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import PersonIcon from "@mui/icons-material/Person";
import EventIcon from "@mui/icons-material/Event";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import MicIcon from "@mui/icons-material/Mic";
import { StatCard } from "./components/charts/stat-card";
import { LineChart } from "./components/charts/line-chart";
import { BarChart } from "./components/charts/bar-chart";
import { AreaChart } from "./components/charts/area-chart";
import { DonutChart } from "./components/charts/donut-chart";
import { PieChart } from "./components/charts/pie-chart";
import { RecentMeetingsTable } from "./components/recent-meetings-table";
import { ChartCard } from "./components/chart-card";
import { attendanceTrend, meetingsOverTime, meetingTypeData, statusDistribution, topHosts } from "./mock-data";



export function DashboardMain() {
  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Meeting Assistant</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Overview for June 2026</p>
      </div>

      {/* Row 1 — Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard
          title="Total Meetings"
          value="397"
          icon={<GroupsIcon fontSize="inherit" />}
          iconBg="bg-gradient-to-br from-blue-400 to-blue-600"
          change={12}
          changeLabel="vs last month"
        />
        <StatCard
          title="Avg. Duration"
          value="52 min"
          icon={<AccessTimeIcon fontSize="inherit" />}
          iconBg="bg-gradient-to-br from-purple-400 to-purple-600"
          change={-4}
          changeLabel="vs last month"
        />
        <StatCard
          title="Active Hosts"
          value="84"
          icon={<PersonIcon fontSize="inherit" />}
          iconBg="bg-gradient-to-br from-emerald-400 to-emerald-600"
          change={8}
          changeLabel="vs last month"
        />
        <StatCard
          title="Upcoming Today"
          value="6"
          icon={<EventIcon fontSize="inherit" />}
          iconBg="bg-gradient-to-br from-orange-400 to-orange-600"
          footer="Next: Design Sync at 14:30"
        />
      </div>

      {/* Row 2 — Line Chart + Donut Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <ChartCard title="Meetings Over Time (2026)">
            <LineChart
              categories={meetingsOverTime.categories}
              series={meetingsOverTime.series}
              height="280px"
              colors={["#5470c6", "#91cc75"]}
            />
          </ChartCard>
        </div>
        <div className="lg:col-span-1">
          <ChartCard title="Meeting Type Breakdown">
            <DonutChart
              name="Meeting Types"
              data={meetingTypeData}
              height="280px"
              centerText="100%"
              centerSubText="Coverage"
              colors={["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de"]}
            />
          </ChartCard>
        </div>
      </div>

      {/* Row 3 — Bar Chart + Area Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Top Meeting Hosts">
          <BarChart
            categories={topHosts.categories}
            series={topHosts.series}
            height="280px"
            colors={["#5470c6"]}
            showLegend={false}
          />
        </ChartCard>
        <ChartCard title="Attendance Trend (Internal vs External)">
          <AreaChart
            categories={attendanceTrend.categories}
            series={attendanceTrend.series}
            height="280px"
          />
        </ChartCard>
      </div>

      {/* Row 4 — Pie Chart + KPI cards + mini bar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1">
          <ChartCard title="Meeting Status Distribution">
            <PieChart
              data={statusDistribution}
              width="100%"
              height="280px"
              showLabels={true}
              labelsPosition="outside"
              showLabelLine={true}
              outerRadiusPercentage="75%"
              innerRadiusPercentage="0%"
            />
          </ChartCard>
        </div>
        <div className="lg:col-span-2 flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <StatCard
              title="Completion Rate"
              value="78.6%"
              icon={<CheckCircleOutlineIcon fontSize="inherit" />}
              iconBg="bg-gradient-to-br from-teal-400 to-teal-600"
              change={3}
              changeLabel="vs last month"
            />
            <StatCard
              title="Recorded Sessions"
              value="214"
              icon={<MicIcon fontSize="inherit" />}
              iconBg="bg-gradient-to-br from-pink-400 to-pink-600"
              change={21}
              changeLabel="vs last month"
            />
          </div>
          <ChartCard title="Meetings by Day of Week">
            <BarChart
              categories={["Mon", "Tue", "Wed", "Thu", "Fri"]}
              series={[{ name: "Meetings", data: [72, 95, 88, 80, 62] }]}
              height="140px"
              colors={["#91cc75"]}
              showLegend={false}
            />
          </ChartCard>
        </div>
      </div>

      {/* Row 5 — Recent Meetings Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg dark:shadow-dark-xl overflow-hidden">
        <RecentMeetingsTable />
      </div>

    </div>
  );
}