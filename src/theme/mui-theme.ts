import { createTheme } from "@mui/material/styles";

// Primary blue matches the Tailwind `primary` (blue) palette used across the app.
const PRIMARY_MAIN = "#3b82f6"; // blue-500

export const lightTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: PRIMARY_MAIN },
  },
});

export const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: PRIMARY_MAIN },
    background: {
      default: "#0f172a", // slate-900
      paper: "#1e293b", // slate-800
    },
    text: {
      primary: "#e2e8f0", // slate-200
      secondary: "#94a3b8", // slate-400
    },
    divider: "#334155", // slate-700
  },
});
