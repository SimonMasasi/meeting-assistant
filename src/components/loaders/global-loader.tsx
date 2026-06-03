import Backdrop from '@mui/material/Backdrop';
import CircularProgress from '@mui/material/CircularProgress';
import { useAtom } from 'jotai';
import { loadingAtom } from '@/atoms/shared-atoms';

export interface GlobalLoaderProps{

}

export default function GlobalLoader() {
  const [loading, _] = useAtom(loadingAtom)

  return (
    <div>
      <Backdrop
        sx={{ color: '#fff', zIndex: 9000}}
        open={loading}
      >
        <CircularProgress color="inherit" />
      </Backdrop>
    </div>
  );
}