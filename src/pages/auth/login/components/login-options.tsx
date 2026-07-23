import { useState } from 'react';
import toast from 'react-hot-toast';
import GoogleIcon from '@mui/icons-material/Google';
import EmailIcon from '@mui/icons-material/Email';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import { useSetAtom } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { appModeAtom } from '@/atoms/app-mode-atoms';
import { useSession } from '@/hooks/auth';
import emblem from '../../../../assets/images/meeting.webp';

interface LoginOptionsProps {
  onEmailClick: () => void;
}

const BASE_BTN = 'w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

const AUTH_PROVIDERS = [
  {
    id: 'google',
    label: 'Continue with Google',
    Icon: GoogleIcon,
    iconClass: 'text-danger-500 login-icon-md',
    variant: 'border border-neutral-200 bg-white dark:bg-slate-800 hover:bg-neutral-50 text-neutral-700 dark:text-slate-200 shadow-sm',
  },
  {
    id: 'email',
    label: 'Continue with Email',
    Icon: EmailIcon,
    iconClass: 'login-icon-md',
    variant: 'bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white shadow-sm',
  },
] as const;

export function LoginOptions({ onEmailClick }: LoginOptionsProps) {
  const setAppMode = useSetAtom(appModeAtom);
  const navigate = useNavigate();
  const { signInWithGoogle } = useSession();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const continueWithGoogle = async () => {
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
      // Signing in flips the route gates into cloud mode (mirrored into Rust by
      // the App-level effect), same as the email form.
      setAppMode('cloud');
      navigate('/main/dashboard', { replace: true });
    } catch (err) {
      const message =
        typeof err === 'string' ? err : (err as Error)?.message ?? 'Google sign-in failed';
      toast.error(message);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const continueLocal = () => {
    setAppMode('local');
    navigate('/main/dashboard', { replace: true });
  };

  return (
    <>
      {/* Logo */}
      <div className="flex justify-center mb-5">
        <img src={emblem} alt="Meeting Assistant" className="h-14 w-14 object-contain" />
      </div>

      {/* Heading */}
      <h1 className="text-2xl font-bold text-neutral-900 text-center">Welcome back</h1>
      <p className="text-sm text-neutral-500 dark:text-slate-400 text-center mt-1 mb-8">
        Sign in to your account or create a new one
      </p>

      {/* Auth provider buttons */}
      <div className="space-y-3">
        {AUTH_PROVIDERS.map(({ id, label, Icon, iconClass, variant }) => {
          const isGoogle = id === 'google';
          const showSpinner = isGoogle && isGoogleLoading;
          return (
            <button
              key={id}
              type="button"
              onClick={isGoogle ? continueWithGoogle : id === 'email' ? onEmailClick : undefined}
              disabled={isGoogleLoading}
              className={`${BASE_BTN} ${variant}`}
            >
              {showSpinner ? <span className="login-spinner login-spinner--dark" /> : <Icon className={iconClass} />}
              {showSpinner ? 'Signing in…' : label}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4 my-6">
        <div className="flex-1 h-px bg-neutral-200" />
        <span className="text-xs text-neutral-400 dark:text-slate-500 font-medium tracking-widest uppercase">or</span>
        <div className="flex-1 h-px bg-neutral-200" />
      </div>

      {/* Guest → use the app in local (on-device) mode, no account. */}
      <button
        type="button"
        onClick={continueLocal}
        disabled={isGoogleLoading}
        className={`${BASE_BTN} border border-neutral-300 bg-white dark:bg-slate-800 hover:bg-neutral-50 text-neutral-600 dark:text-slate-400`}
      >
        <AccountCircleOutlinedIcon className="login-icon-md" />
        Continue in local mode
      </button>
    </>
  );
}
