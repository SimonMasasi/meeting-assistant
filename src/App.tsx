import "./App.css";
import "./styles/argon-dashboard-tailwind.css";
import "./styles/animation.css"
import { RouterProvider } from "react-router-dom";
import { baseRouter } from "./Routes";
import { Toaster } from "react-hot-toast";
import GlobalLoader from "./components/loaders/global-loader";

function App() {
  return (
    <div>
        <Toaster/>
        <GlobalLoader/>
        <RouterProvider router={baseRouter} />
    </div>
  );
}

export default App;
