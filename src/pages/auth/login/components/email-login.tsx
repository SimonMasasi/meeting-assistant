
import { useState } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import emblem from '../../../../assets/images/meeting.webp';
import '../styles.css';
import { ForgotPassword } from './forgot-password';
import { useNavigate } from 'react-router-dom';

type Mode = 'signin' | 'signup';

const MODE_CONFIG: Record<Mode, {
  heading: string;
  subtext: string;
  passwordPlaceholder: string;
  passwordAutoComplete: 'current-password' | 'new-password';
  submitLabel: string;
  loadingLabel: string;
  togglePrompt: string;
  toggleLabel: string;
  toggleTarget: Mode;
}> = {
  signin: {
    heading: 'Welcome back',
    subtext: 'Sign in with your email and password',
    passwordPlaceholder: 'Enter your password',
    passwordAutoComplete: 'current-password',
    submitLabel: 'Sign in',
    loadingLabel: 'Signing in…',
    togglePrompt: "Don't have an account? ",
    toggleLabel: 'Sign up',
    toggleTarget: 'signup',
  },
  signup: {
    heading: 'Create account',
    subtext: 'Fill in the details below to get started',
    passwordPlaceholder: 'Create a password',
    passwordAutoComplete: 'new-password',
    submitLabel: 'Create account',
    loadingLabel: 'Creating account…',
    togglePrompt: 'Already have an account? ',
    toggleLabel: 'Sign in',
    toggleTarget: 'signin',
  },
};

interface EmailLoginProps {
  onBack: () => void;
}

export const EmailLogin = ({ onBack }: EmailLoginProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>('signin');
  const [showForgot, setShowForgot] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const cfg = MODE_CONFIG[mode];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate authentication — replace with real API call
    setTimeout(() => {
      navigate('main/dashboard');
    }, 1800);
  };

  if (showForgot) {
    return (
      <div className="bg-white rounded-3xl shadow-xl px-8 py-10">
        <ForgotPassword
          initialEmail={email}
          onBack={() => setShowForgot(false)}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-xl px-8 py-10">

      {/* Logo */}
      <div className="flex justify-center mb-5">
        <img src={emblem} alt="Meeting Assistant" className="h-14 w-14 object-contain" />
      </div>

      {/* Back + Heading */}
      <div className="relative flex items-center justify-center mb-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="absolute left-0 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
        >
          <ArrowBackIcon className="login-icon-md" />
        </button>
        <h1 className="text-2xl font-bold text-neutral-900">{cfg.heading}</h1>
      </div>
      <p className="text-sm text-neutral-500 text-center mt-1 mb-7">{cfg.subtext}</p>

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className={`space-y-4${isLoading ? ' pointer-events-none' : ''}`}>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1.5">
            Email address
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-neutral-400">
              <EmailOutlinedIcon className="login-icon-sm" />
            </span>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={isLoading}
              className="w-full pl-10 pr-4 py-2.5 border border-neutral-200 rounded-xl text-sm text-neutral-800 placeholder-neutral-400 bg-neutral-50 focus:bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition disabled:opacity-50"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
              Password
            </label>
            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                className="text-xs text-primary-500 hover:text-primary-600 hover:underline font-medium"
              >
                Forgot password?
              </button>
            )}
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-neutral-400">
              <LockOutlinedIcon className="login-icon-sm" />
            </span>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={cfg.passwordAutoComplete}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={cfg.passwordPlaceholder}
              required
              disabled={isLoading}
              className="w-full pl-10 pr-11 py-2.5 border border-neutral-200 rounded-xl text-sm text-neutral-800 placeholder-neutral-400 bg-neutral-50 focus:bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-3.5 flex items-center text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              {showPassword
                ? <VisibilityOffOutlinedIcon className="login-icon-sm" />
                : <VisibilityOutlinedIcon className="login-icon-sm" />}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className={`w-full py-3 rounded-xl text-white text-sm font-semibold tracking-wide transition-colors shadow-sm mt-2 flex items-center justify-center gap-2 ${
            isLoading
              ? 'bg-primary-400 cursor-not-allowed'
              : 'bg-primary-500 hover:bg-primary-600 active:bg-primary-700'
          }`}
        >
          {isLoading ? (
            <>
              <span className="login-spinner" />
              {cfg.loadingLabel}
            </>
          ) : (
            cfg.submitLabel
          )}
        </button>
      </form>

      {/* Toggle mode */}
      <p className="text-xs text-neutral-500 text-center mt-6">
        {cfg.togglePrompt}
        <button
          type="button"
          onClick={() => setMode(cfg.toggleTarget)}
          className="text-primary-500 hover:text-primary-600 hover:underline font-medium"
        >
          {cfg.toggleLabel}
        </button>
      </p>

    </div>
  );
};

