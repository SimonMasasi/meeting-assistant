import * as React from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { Edit, Logout, Person, SwapHoriz } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAtomValue } from "jotai";
import { appModeAtom } from "@/atoms/app-mode-atoms";
import { useSession } from "@/hooks/auth";

const AVATAR_SIZE = 36;



export function ProfileBar() {
  const [anchorElUser, setAnchorElUser] = React.useState<null | HTMLElement>(
    null
  );

  const navigate = useNavigate();
  const mode = useAtomValue(appModeAtom);
  const { session, signOut } = useSession();

  const closeMenu = () => setAnchorElUser(null);

  // Logout clears the session; cloud returns to login, local back to the chooser.
  const handleLogout = () => {
    closeMenu();
    signOut();
    navigate(mode === "cloud" ? "/login" : "/mode-select", { replace: true });
  };

  const handleSwitchMode = () => {
    closeMenu();
    navigate("/mode-select");
  };

  const menuItems = [
  { name: "Profile", icon: <Person fontSize="small" />, danger: false , calBackFunction: closeMenu},
  { name: "Change Password", icon: <Edit fontSize="small" />, danger: false, calBackFunction: closeMenu },
  { name: "Switch mode", icon: <SwapHoriz fontSize="small" />, danger: false, calBackFunction: handleSwitchMode },
  { name: "Logout", icon: <Logout fontSize="small" />, danger: true, calBackFunction: handleLogout },
];


  const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorElUser(event.currentTarget);
  };



  return (
    <Box sx={{ flexShrink: 0 }}>
      <Tooltip title="Account">
        <IconButton
          onClick={handleOpenUserMenu}
          aria-label="Open account menu"
          aria-controls={anchorElUser ? "profile-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={Boolean(anchorElUser)}
          sx={{ p: 0.5 }}
        >
          <Avatar
            alt="User profile"
            src="/src/assets/images/profile.png"
            sx={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
          />
        </IconButton>
      </Tooltip>

      <Menu
        id="profile-menu"
        anchorEl={anchorElUser}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        open={Boolean(anchorElUser)}
        onClose={closeMenu}
        slotProps={{
          paper: {
            elevation: 3,
            sx: { mt: 1, minWidth: 190, borderRadius: 2 },
          },
        }}
      >
        {/* User info header */}
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" fontWeight={600} noWrap>
            {session?.email ?? "Welcome back"}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {mode === "cloud" ? "Cloud mode" : "Local mode"}
          </Typography>
        </Box>

        <Divider />

        {menuItems.map((item) => (
          <MenuItem
            key={item.name}
            onClick={item.calBackFunction}
            sx={{ color: item.danger ? "error.main" : "text.primary", gap: 1 }}
          >
            <ListItemIcon sx={{ color: "inherit", minWidth: "auto" }}>
              {item.icon}
            </ListItemIcon>
            <Typography variant="body2">{item.name}</Typography>
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

