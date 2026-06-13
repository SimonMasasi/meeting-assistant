import { useState } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import emblem from '../../../../assets/images/meeting.webp';
import '../styles.css';

interface ForgotPasswordProps {
  initialEmail?: string;
  onBack: () => void;
}

export function ForgotPassword({ initialEmail = '', onBack }: ForgotPasswordProps) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: call password-reset API
    setSent(true);
  };

  if (sent) {
    return (
      <>
        {/* Success icon */}
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center">
            <MarkEmailReadOutlinedIcon className="text-primary-500 login-icon-xl" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-neutral-900 text-center">Check your inbox</h1>
        <p className="text-sm text-neutral-500 dark:text-slate-400 text-center mt-2 mb-6">
          We've sent a reset link to{' '}
          <span className="font-medium text-neutral-700 dark:text-slate-200 break-all">{email}</span>
        </p>

        <p className="text-xs text-neutral-400 dark:text-slate-500 text-center">
          Didn't receive it?{' '}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="text-primary-500 hover:text-primary-600 hover:underline font-medium"
          >
            Resend
          </button>
        </p>

        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-neutral-100" />
          <span className="text-xs text-neutral-300 font-medium tracking-widest uppercase">or</span>
          <div className="flex-1 h-px bg-neutral-100" />
        </div>

        <button
          type="button"
          onClick={onBack}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-neutral-200 text-sm text-neutral-600 dark:text-slate-400 hover:bg-neutral-50 transition-colors"
        >
          <ArrowBackIcon className="login-icon-sm" />
          Back to sign in
        </button>
      </>
    );
  }

  return (
    <>
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
          className="absolute left-0 p-1.5 rounded-lg text-neutral-400 dark:text-slate-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
        >
          <ArrowBackIcon className="login-icon-md" />
        </button>
        <h1 className="text-2xl font-bold text-neutral-900">Reset password</h1>
      </div>
      <p className="text-sm text-neutral-500 dark:text-slate-400 text-center mt-1 mb-7">
        Enter your email and we'll send you a reset link
      </p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="reset-email"
            className="block text-sm font-medium text-neutral-700 dark:text-slate-200 mb-1.5"
          >
            Email address
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-neutral-400 dark:text-slate-500">
              <EmailOutlinedIcon className="login-icon-sm" />
            </span>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full pl-10 pr-4 py-2.5 border border-neutral-200 dark:border-slate-700 rounded-xl text-sm text-neutral-800 dark:text-slate-200 placeholder-neutral-400 dark:placeholder-slate-500 bg-neutral-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-3 rounded-xl bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white text-sm font-semibold tracking-wide transition-colors shadow-sm mt-2"
        >
          Send reset link
        </button>
      </form>
    </>
  );
}
