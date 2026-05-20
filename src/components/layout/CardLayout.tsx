import { Dashboard } from "@mui/icons-material";
import { cardLayoutProps } from "../../interfaces/SharedInterfaces";
import { NavLink } from "react-router-dom";

type cardProps = {
  navs: cardLayoutProps[];
};

export function CardLayout(props: cardProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 intro-x">
      {props.navs.map((card, key) => {
        return (
          <NavLink to={card?.to} key={key}>
            <div>
              <div className="cursor-pointer  hover:-translate-y-px">
                <div className="min-w-0 break-words bg-white shadow-xl dark:bg-slate-850 dark:shadow-dark-xl rounded-2xl bg-clip-border">
                  <div className="flex-auto p-4">
                    <div className="flex flex-row -mx-3">
                      <div className="flex-none w-2/3 max-w-full px-3">
                        <div>
                          <p className="mb-0 font-sans text-sm font-semibold leading-normal uppercase">
                            {card?.name}
                          </p>
                        </div>
                      </div>
                      <div className="px-3 text-right basis-1/3">
                        <div className="inline-block w-12 h-12 text-center rounded-circle bg-gradient-to-tl from-gray-200 to-gray-400">
                          <div className=" flex justify-center mt-2 text-blue-400">
                          {card?.icon ?? <Dashboard/>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </NavLink>
        );
      })}
    </div>
  );
}
