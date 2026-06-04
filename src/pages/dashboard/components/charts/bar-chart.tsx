import ReactECharts from "echarts-for-react";

export interface BarChartSeries {
  name: string;
  data: number[];
  color?: string;
}

export interface BarChartProps {
  title?: string;
  categories: string[];
  series: BarChartSeries[];
  width?: string;
  height?: string;
  horizontal?: boolean;
  showLegend?: boolean;
  colors?: string[];
  yAxisLabel?: string;
  xAxisLabel?: string;
}

export function BarChart(props: BarChartProps) {
  const defaultColors = [
    "#5470c6",
    "#91cc75",
    "#fac858",
    "#ee6666",
    "#73c0de",
    "#3ba272",
    "#fc8452",
    "#9a60b4",
  ];

  const colors =
    props.colors && props.colors.length > 0 ? props.colors : defaultColors;

  const seriesData = props.series.map((s, i) => ({
    name: s.name,
    type: "bar",
    barMaxWidth: 40,
    itemStyle: {
      color: s.color || colors[i % colors.length],
      borderRadius: props.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
    },
    data: s.data,
    emphasis: {
      itemStyle: {
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowColor: "rgba(0, 0, 0, 0.2)",
      },
    },
  }));

  const options = {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
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
    xAxis: props.horizontal
      ? {
          type: "value",
          name: props.xAxisLabel,
          nameLocation: "middle",
          nameGap: 30,
        }
      : {
          type: "category",
          data: props.categories,
          name: props.xAxisLabel,
          nameLocation: "middle",
          nameGap: 30,
          axisLabel: { rotate: props.categories.length > 6 ? 30 : 0 },
        },
    yAxis: props.horizontal
      ? {
          type: "category",
          data: props.categories,
          name: props.yAxisLabel,
        }
      : {
          type: "value",
          name: props.yAxisLabel,
          nameLocation: "middle",
          nameGap: 40,
        },
    series: seriesData,
  };

  return (
    <div style={{ width: props.width || "100%", height: props.height || "300px" }}>
      <ReactECharts option={options} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
