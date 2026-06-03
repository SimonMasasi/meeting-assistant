import * as React from "react";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { DataTableActions } from "@/interfaces/shared-interfaces";

type TableActionsProps = {
  actions: DataTableActions[];
  data: any;
};

const ITEM_HEIGHT = 48;

export default function TableActions(props: TableActionsProps) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <div className="intro-x">
      <IconButton aria-label="more" aria-haspopup="true" onClick={handleClick}>
        <MoreVertIcon />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{
          paper: {
            style: {
              maxHeight: ITEM_HEIGHT * 4.5,
            },
          },
        }}
      >
        {props.actions.map((action, key) => (
          <div key={key} className="intro-x">
            <MenuItem onClick={() => action.calBackFunction(props.data)}>
              {action.icon}
              {action.title}
            </MenuItem>
          </div>
        ))}
      </Menu>
    </div>
  );
}
