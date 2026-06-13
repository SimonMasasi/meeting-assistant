import { useState } from 'react';
import { EmailLogin } from './components/email-login';
import { LoginOptions } from './components/login-options';
import './styles.css';

export function LoginMain() {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center px-4 py-12">
      <div className="login-perspective w-full max-w-md">
        <div className={`login-flip-inner${flipped ? ' is-flipped' : ''}`}>
          {/* ── FRONT FACE ── */}
          <div className="login-face absolute inset-0 bg-white dark:bg-slate-800 rounded-3xl shadow-xl px-8 py-10">
            <LoginOptions onEmailClick={() => setFlipped(true)} />
          </div>

          {/* ── BACK FACE ── */}
          <div className="login-face login-face--back absolute inset-0">
            <EmailLogin onBack={() => setFlipped(false)} />
          </div>
        </div>
      </div>
    </div>
  );
}
