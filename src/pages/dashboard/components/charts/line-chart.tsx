import ReactECharts from "echarts-for-react";

export interface LineChartSeries {
  name: string;
  data: number[];
  color?: string;
  smooth?: boolean;
}

export interface LineChartProps {
  title?: string;
  categories: string[];
  series: LineChartSeries[];
  width?: string;
  height?: string;
  showLegend?: boolean;
  colors?: string[];
  yAxisLabel?: string;
  xAxisLabel?: string;
  showDots?: boolean;
}

export function LineChart(props: LineChartProps) {
  const defaultColors = [
    "#5470c6",
    "#91cc75",
    "#fac858",
    "#ee6666",
    "#73c0de",
    "#3ba272",
  ];

  const colors =
    props.colors && props.colors.length > 0 ? props.colors : defaultColors;

  const seriesData = props.series.map((s, i) => ({
    name: s.name,
    type: "line",
    smooth: s.smooth !== false,
    symbol: props.showDots !== false ? "circle" : "none",
    symbolSize: 6,
    lineStyle: { color: s.color || colors[i % colors.length], width: 2.5 },
    itemStyle: { color: s.color || colors[i % colors.length] },
    data: s.data,
  }));

  const options = {
    tooltip: {
      trigger: "axis",
    },
    legend: props.showLegend !== false
      ? { bottom: 0, type: "scroll" }
      : { show: false },
    grid: {
      left: "3%",
      right: "4%",
      bottom: props.showLegend !== false ? "12%" : "6%",
      top: "6%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: props.categories,
      name: props.xAxisLabel,
      nameLocation: "middle",
      nameGap: 30,
      axisLine: { lineStyle: { color: "#e0e0e0" } },
    },
    yAxis: {
      type: "value",
      name: props.yAxisLabel,
      nameLocation: "middle",
      nameGap: 40,
      splitLine: { lineStyle: { color: "#f0f0f0" } },
    },
    series: seriesData,
  };

  return (
    <div style={{ width: props.width || "100%", height: props.height || "300px" }}>
      <ReactECharts option={options} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
