import { Dashboard } from "@mui/icons-material";
import { cardLayoutProps } from "../../interfaces/shared-interfaces";
import { NavLink } from "react-router-dom";

type cardProps = {
  cards: cardLayoutProps[];
};

export function CardLayout(props: cardProps) {
  if (!props.cards.length) {
    return (
      <p className="text-sm text-slate-500 py-8 text-center">
        No items to display.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 intro-x">
      {props.cards.map((card, key) => (
        <NavLink
          to={card?.to}
          key={key}
          aria-label={`Go to ${card?.name}`}
          className="block"
        >
          <div className="cursor-pointer hover:-translate-y-1 hover:shadow-2xl transition-all duration-200">
            <div className="min-w-0 break-words bg-white shadow-xl dark:bg-slate-800 dark:shadow-dark-xl rounded-2xl bg-clip-border">
              <div className="flex-auto p-4">
                <div className="flex flex-row -mx-3">
                  <div className="flex-none w-2/3 max-w-full px-3">
                    <p className="mb-0 font-sans text-sm font-semibold leading-normal uppercase tracking-wide text-slate-600">
                      {card?.name}
                    </p>
                  </div>
                  <div className="px-3 text-right basis-1/3">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-tl from-primary-200 to-primary-400">
                      <span className="flex justify-center text-primary-600">
                        {card?.icon ?? <Dashboard />}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </NavLink>
      ))}
    </div>
  );
}
