import GoogleIcon from '@mui/icons-material/Google';
import AppleIcon from '@mui/icons-material/Apple';
import EmailIcon from '@mui/icons-material/Email';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import emblem from '../../../assets/images/meeting.webp';

export function LoginMain() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl px-8 py-10">

          {/* Logo */}
          <div className="flex justify-center mb-5">
            <img src={emblem} alt="Meeting Assistant" className="h-14 w-14 object-contain" />
          </div>

          {/* Heading */}
          <h1 className="text-2xl font-bold text-gray-900 text-center">Welcome back</h1>
          <p className="text-sm text-gray-500 text-center mt-1 mb-8">
            Sign in to your account or create a new one
          </p>

          {/* Auth Buttons */}
          <div className="space-y-3">
            {/* Google */}
            <button
              type="button"
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl bg-white hover:bg-gray-100 text-gray-700 text-sm font-medium transition-colors shadow-sm"
            >
              <GoogleIcon className="text-red-500" style={{ fontSize: 20 }} />
              Continue with Google
            </button>

            {/* Apple */}
            <button
              type="button"
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-gray-500 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
            >
              <AppleIcon style={{ fontSize: 20 }} />
              Continue with Apple
            </button>

            {/* Email */}
            <button
              type="button"
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-blue-400 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              <EmailIcon style={{ fontSize: 20 }} />
              Continue with Email
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium tracking-widest uppercase">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Guest */}
          <button
            type="button"
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-xl bg-white hover:bg-gray-100 text-gray-600 text-sm font-medium transition-colors"
          >
            <AccountCircleOutlinedIcon style={{ fontSize: 20 }} />
            Continue Without Account
          </button>

          {/* Footer */}
          <p className="text-xs text-gray-400 text-center mt-6">
            By continuing, you agree to our{' '}
            <a href="#" className="text-blue-500 hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="#" className="text-blue-500 hover:underline">Privacy Policy</a>
          </p>

        </div>
      </div>
    </div>
  );
}
