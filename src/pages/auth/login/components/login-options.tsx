import GoogleIcon from '@mui/icons-material/Google';
import AppleIcon from '@mui/icons-material/Apple';
import EmailIcon from '@mui/icons-material/Email';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import emblem from '../../../../assets/images/meeting.webp';

interface LoginOptionsProps {
  onEmailClick: () => void;
}

const BASE_BTN = 'w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors';

const AUTH_PROVIDERS = [
  {
    id: 'google',
    label: 'Continue with Google',
    Icon: GoogleIcon,
    iconClass: 'text-danger-500 login-icon-md',
    variant: 'border border-neutral-200 bg-white dark:bg-slate-800 hover:bg-neutral-50 text-neutral-700 dark:text-slate-200 shadow-sm',
  },
  {
    id: 'apple',
    label: 'Continue with Apple',
    Icon: AppleIcon,
    iconClass: 'login-icon-md',
    variant: 'bg-neutral-800 hover:bg-neutral-900 text-white',
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
        {AUTH_PROVIDERS.map(({ id, label, Icon, iconClass, variant }) => (
          <button
            key={id}
            type="button"
            onClick={id === 'email' ? onEmailClick : undefined}
            className={`${BASE_BTN} ${variant}`}
          >
            <Icon className={iconClass} />
            {label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4 my-6">
        <div className="flex-1 h-px bg-neutral-200" />
        <span className="text-xs text-neutral-400 dark:text-slate-500 font-medium tracking-widest uppercase">or</span>
        <div className="flex-1 h-px bg-neutral-200" />
      </div>

      {/* Guest */}
      <button
        type="button"
        className={`${BASE_BTN} border border-neutral-300 bg-white dark:bg-slate-800 hover:bg-neutral-50 text-neutral-600 dark:text-slate-400`}
      >
        <AccountCircleOutlinedIcon className="login-icon-md" />
        Continue Without Account
      </button>
    </>
  );
}
