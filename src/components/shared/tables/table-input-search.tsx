import { TextField, InputAdornment, IconButton } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";

interface DataTableSearchProps {
  value: string;
  onChange: (val: string) => void;
}

export default function DataTableSearch({ value, onChange }: DataTableSearchProps) {
  return (
    <TextField
      size="small"
      variant="outlined"
      placeholder="Search records..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{ minWidth: 260, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" sx={{ color: "text.secondary" }} />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => onChange("")} edge="end">
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : null,
        },
      }}
    />
  );
}
