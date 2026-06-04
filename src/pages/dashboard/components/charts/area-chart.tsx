import ReactECharts from "echarts-for-react";

export interface AreaChartSeries {
  name: string;
  data: number[];
  color?: string;
  gradientFrom?: string;
  gradientTo?: string;
}

export interface AreaChartProps {
  title?: string;
  categories: string[];
  series: AreaChartSeries[];
  width?: string;
  height?: string;
  showLegend?: boolean;
  stacked?: boolean;
  yAxisLabel?: string;
  xAxisLabel?: string;
}

const defaultPalette = [
  { line: "#5470c6", from: "rgba(84,112,198,0.4)", to: "rgba(84,112,198,0.02)" },
  { line: "#91cc75", from: "rgba(145,204,117,0.4)", to: "rgba(145,204,117,0.02)" },
  { line: "#fac858", from: "rgba(250,200,88,0.4)", to: "rgba(250,200,88,0.02)" },
  { line: "#ee6666", from: "rgba(238,102,102,0.4)", to: "rgba(238,102,102,0.02)" },
  { line: "#73c0de", from: "rgba(115,192,222,0.4)", to: "rgba(115,192,222,0.02)" },
];

export function AreaChart(props: AreaChartProps) {
  const seriesData = props.series.map((s, i) => {
    const palette = defaultPalette[i % defaultPalette.length];
    const lineColor = s.color || palette.line;
    const fromColor = s.gradientFrom || palette.from;
    const toColor = s.gradientTo || palette.to;

    return {
      name: s.name,
      type: "line",
      smooth: true,
      symbol: "none",
      stack: props.stacked ? "total" : undefined,
      lineStyle: { color: lineColor, width: 2.5 },
      itemStyle: { color: lineColor },
      areaStyle: {
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: fromColor },
            { offset: 1, color: toColor },
          ],
        },
      },
      data: s.data,
    };
  });

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
