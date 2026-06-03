import * as React from "react";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
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
    <div>
      <Tooltip title="More actions">
        <IconButton
          aria-label="more"
          aria-haspopup="true"
          onClick={handleClick}
          size="small"
          sx={{ borderRadius: 1.5 }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        slotProps={{
          paper: {
            elevation: 3,
            sx: { borderRadius: 2, minWidth: 160 },
            style: { maxHeight: ITEM_HEIGHT * 4.5 },
          },
        }}
      >
        <div className="into-x">
         {props.actions.map((action, key) => (
          <MenuItem
            key={key}
            onClick={() => {
              action.calBackFunction(props.data);
              handleClose();
            }}
            sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1, fontSize: "0.875rem" }}
          >
            {action.icon}
            {action.title}
          </MenuItem>
        ))}

        </div>

      </Menu>
    </div>
  );
}
