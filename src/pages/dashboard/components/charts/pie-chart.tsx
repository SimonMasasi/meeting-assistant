import ReactECharts from "echarts-for-react";
import { useChartTheme } from "./chart-theme";

export interface PieChartData {
  value: number;
  name: string;
}

export interface PieChartProps {
  name?: string;
  data: PieChartData[];
  width?: string;
  height?: string;
  outerRadiusPercentage?: string;
  innerRadiusPercentage?: string;
  colors?: string[];
  showLegend?: boolean;
  showLabels?: boolean;
  labelsPosition?: string;
  avoidLabelOverlap?: boolean;
  showLabelLine?: boolean;
}

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

export function PieChart(props: PieChartProps) {
  const ct = useChartTheme();
  const colors =
    props.colors && props.colors.length > 0 ? props.colors : defaultColors;

  const options = {
    color: colors,
    tooltip: {
      trigger: "item",
      formatter: "{b}: {c} ({d}%)",
    },
    legend: props.showLegend !== false
      ? { bottom: 0, type: "scroll", textStyle: { color: ct.legendText } }
      : { show: false },
    series: [
      {
        name: props.name || "Pie Chart",
        type: "pie",
        radius: [
          props.innerRadiusPercentage || "0%",
          props.outerRadiusPercentage || "75%",
        ],
        avoidLabelOverlap: props.avoidLabelOverlap ?? true,
        itemStyle: {
          borderRadius: 4,
          borderColor: ct.border,
          borderWidth: 2,
        },
        label: {
          show: props.showLabels !== false,
          position: props.labelsPosition || "outside",
          formatter: "{b}: {d}%",
          color: ct.axisLabel,
        },
        labelLine: {
          show: props.showLabelLine !== false,
        },
        data: props.data,
      },
    ],
  };

  return (
    <div style={{ width: props.width || "100%", height: props.height || "300px" }}>
      <ReactECharts option={options} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
