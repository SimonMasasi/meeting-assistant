import "./App.css";
import "./styles/argon-dashboard-tailwind.css";
import "./styles/animation.css"
import { RouterProvider } from "react-router-dom";
import { baseRouter } from "./Routes";
import { Toaster } from "react-hot-toast";
import { ApolloProvider } from "@apollo/client";
import { graphqlClient } from "./utils/ApolloClient";
import GlobalLoader from "./components/loaders/globalLoader";

function App() {
  return (
    <div>
      <ApolloProvider client={graphqlClient}>
        <Toaster/>
        <GlobalLoader/>
        <RouterProvider router={baseRouter} />
      </ApolloProvider>
    </div>
  );
}

export default App;
