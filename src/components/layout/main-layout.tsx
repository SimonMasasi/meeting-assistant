import { Outlet } from "react-router-dom";
import { Navbar } from "./nav-bar";
import { SideBar } from "./side-bar";

export function MainLayout() {
  return (
    <div className="m-0 font-sans text-base antialiased font-normal leading-default bg-gray-50 h-screen text-slate-500">
      <div className="absolute w-full bg-blue-500 dark:hidden h-64"></div>
      <SideBar></SideBar>
        <main className="relative h-full max-h-screen overflow-y-auto transition-all duration-200 ease-in-out xl:ml-68 rounded-xl">
        <Navbar></Navbar> 
        <div className="w-full p-6  mx-auto">
          {/* Main App Entry Point */}
          <Outlet/>
        </div>
      </main>
    </div>
  );
}
