import ReactECharts from "echarts-for-react";

export interface DonutChartData {
  value: number;
  name: string;
}

export interface DonutChartProps {
  name?: string;
  data: DonutChartData[];
  width?: string;
  height?: string;
  innerRadius?: string;
  outerRadius?: string;
  colors?: string[];
  showLegend?: boolean;
  showLabels?: boolean;
  centerText?: string;
  centerSubText?: string;
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

export function DonutChart(props: DonutChartProps) {
  const colors =
    props.colors && props.colors.length > 0 ? props.colors : defaultColors;

  const total = props.data.reduce((sum, d) => sum + d.value, 0);

  const options = {
    color: colors,
    tooltip: {
      trigger: "item",
      formatter: "{b}: {c} ({d}%)",
    },
    legend: props.showLegend !== false
      ? {
          orient: "vertical",
          right: "2%",
          top: "middle",
          type: "scroll",
        }
      : { show: false },
    series: [
      {
        name: props.name || "Donut Chart",
        type: "pie",
        radius: [
          props.innerRadius || "55%",
          props.outerRadius || "80%",
        ],
        center: ["40%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 6,
          borderColor: "#fff",
          borderWidth: 2,
        },
        label: props.showLabels
          ? { show: true, formatter: "{b}: {d}%" }
          : {
              show: true,
              position: "center",
              formatter: () =>
                `{total|${props.centerText ?? total}}\n{sub|${props.centerSubText ?? "Total"}}`,
              rich: {
                total: {
                  fontSize: 22,
                  fontWeight: "bold",
                  color: "#374151",
                  lineHeight: 30,
                },
                sub: {
                  fontSize: 12,
                  color: "#9ca3af",
                  lineHeight: 20,
                },
              },
            },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: "bold",
          },
        },
        labelLine: { show: false },
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
