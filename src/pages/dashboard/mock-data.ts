

export const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const meetingsOverTime = {
  categories: months,
  series: [
    { name: "Scheduled", data: [42, 55, 38, 60, 74, 88, 65, 79, 91, 83, 70, 95] },
    { name: "Completed", data: [38, 50, 35, 55, 68, 80, 60, 72, 85, 76, 65, 88] },
  ],
};

export const attendanceTrend = {
  categories: months,
  series: [
    { name: "Internal", data: [120, 145, 110, 160, 175, 210, 185, 220, 240, 215, 195, 260] },
    { name: "External", data: [40, 55, 30, 65, 80, 95, 70, 88, 100, 92, 75, 110] },
  ],
};

export const topHosts = {
  categories: ["Alice J.", "Bob S.", "Carol W.", "David L.", "Eva B.", "Frank G.", "Grace K."],
  series: [
    { name: "Meetings Hosted", data: [28, 24, 21, 19, 17, 15, 13] },
  ],
};

export const meetingTypeData = [
  { value: 38, name: "Team Standup" },
  { value: 25, name: "Client Demo" },
  { value: 20, name: "Planning" },
  { value: 10, name: "Training" },
  { value: 7, name: "Other" },
];

export const statusDistribution = [
  { value: 312, name: "Completed" },
  { value: 45, name: "Upcoming" },
  { value: 18, name: "Ongoing" },
  { value: 22, name: "Cancelled" },
];
