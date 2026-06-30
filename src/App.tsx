import "./App.css";
import "./styles/argon-dashboard-tailwind.css";
import "./styles/animation.css"
import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { RouterProvider } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { baseRouter } from "./Routes";
import { Toaster } from "react-hot-toast";
import GlobalLoader from "./components/loaders/global-loader";
import { themeAtom } from "./atoms/shared-atoms";
import { appModeAtom } from "./atoms/app-mode-atoms";
import { setAppMode } from "./services/cloud";
import { darkTheme, lightTheme } from "./theme/mui-theme";

function App() {
  const theme = useAtomValue(themeAtom);
  const isDark = theme === "dark";
  const appMode = useAtomValue(appModeAtom);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // Mirror the chosen app mode into Rust so backend-routing commands know which
  // store/inference path to use. Runs on mount and whenever the mode changes.
  useEffect(() => {
    if (appMode) setAppMode(appMode).catch(() => {});
  }, [appMode]);

  return (
    <ThemeProvider theme={isDark ? darkTheme : lightTheme}>
      <CssBaseline />
      <div>
        <Toaster/>
        <GlobalLoader/>
        <RouterProvider router={baseRouter} />
      </div>
    </ThemeProvider>
  );
}

export default App;
