import React, { useState } from 'react';
import { Film, Sparkles, Mail, User, Phone, KeyRound, ArrowRight, CheckCircle2, AlertCircle, Loader2, Info } from 'lucide-react';
import SwipeCaptcha from './SwipeCaptcha';
import { api } from '../services/api';
import logoImg from '../assets/logo.png';

export default function AuthScreen({ onAuthSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');

  // Captcha & OTP states
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [devOtp, setDevOtp] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleResetFlow = (newMode) => {
    setMode(newMode);
    setIsCaptchaVerified(false);
    setOtpRequested(false);
    setOtpCode('');
    setDevOtp('');
    setErrorMessage('');
    setStatusMessage('');
  };

  // Indian Phone Validation helper (at least 10 digits starting with 6, 7, 8, or 9)
  const isIndianPhoneValid = (phone) => {
    const clean = phone.replace(/[\s\-\(\)\+]/g, '');
    return /^((91)?[6-9]\d{9})$/.test(clean);
  };

  // Strict @gmail.com validation
  const isGmailValid = (em) => {
    const clean = em.toLowerCase().trim();
    return clean.endsWith('@gmail.com') || clean.endsWith('@googlemail.com');
  };

  // Captcha lock condition
  const isSignupFormFilled =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 1 &&
    isIndianPhoneValid(contactNumber) &&
    isGmailValid(email);

  const isLoginFormFilled = isGmailValid(email);

  const isCaptchaDisabled = mode === 'signup' ? !isSignupFormFilled : !isLoginFormFilled;
  const disabledMessage =
    mode === 'signup'
      ? 'Fill your name, +91 phone, and @gmail.com to unlock'
      : 'Enter your valid @gmail.com to unlock';

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!isGmailValid(email)) {
      setErrorMessage('Only official @gmail.com addresses are supported.');
      return;
    }

    if (mode === 'signup') {
      if (!firstName.trim() || !lastName.trim()) {
        setErrorMessage('Please enter your first and last name.');
        return;
      }
      if (!isIndianPhoneValid(contactNumber)) {
        setErrorMessage('Please enter a valid 10-digit Indian mobile number (e.g. +91 98765 43210).');
        return;
      }
    }

    if (!isCaptchaVerified) {
      setErrorMessage('Please complete the swipe puzzle verification first.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.requestOtp({
        email: email.toLowerCase().trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        contact_number: contactNumber.trim(),
        is_signup: mode === 'signup',
        captcha_verified: isCaptchaVerified,
      });

      setOtpRequested(true);
      setStatusMessage(res.message || 'OTP verification code sent to your Gmail!');
      if (res.dev_otp) {
        setDevOtp(res.dev_otp);
        setOtpCode(res.dev_otp);
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to request OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!otpCode.trim() || otpCode.length < 6) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.verifyOtp({
        email: email.toLowerCase().trim(),
        otp: otpCode.trim(),
      });

      onAuthSuccess(res.user);
    } catch (err) {
      setErrorMessage(err.response?.data?.error || err.message || 'OTP verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-lime-neon/5 rounded-full filter blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-lime-500/5 rounded-full filter blur-3xl pointer-events-none"></div>

      {/* Main Auth Card */}
      <div className="w-full max-w-md bg-dark-900 border border-dark-700/80 rounded-3xl p-8 shadow-2xl relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-dark-950 border border-lime-neon/40 flex items-center justify-center p-1.5 shadow-neon mb-3">
            <img src={logoImg} alt="Clipzzz Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-black tracking-wider text-white">
            CLIP<span className="text-lime-neon">ZZZ</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            AI YouTube Shorts Automation & Clipping Studio
          </p>
        </div>

        {/* Notice: Only Gmail Allowed */}
        <div className="mb-5 p-2.5 bg-dark-950 rounded-xl border border-lime-neon/30 flex items-center gap-2 text-[11px] text-lime-neon">
          <Info className="w-4 h-4 shrink-0 text-lime-neon" />
          <span>Only <strong>@gmail.com</strong> accounts supported with Gmail SMTP OTP.</span>
        </div>

        {/* Tab Switcher */}
        {!otpRequested && (
          <div className="grid grid-cols-2 p-1 bg-dark-950 rounded-2xl border border-dark-800 mb-5">
            <button
              type="button"
              onClick={() => handleResetFlow('login')}
              className={`py-2 text-xs font-bold rounded-xl transition ${
                mode === 'login'
                  ? 'bg-dark-800 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleResetFlow('signup')}
              className={`py-2 text-xs font-bold rounded-xl transition ${
                mode === 'signup'
                  ? 'bg-dark-800 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Error / Status Messages */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {statusMessage && (
          <div className="mb-4 p-3 bg-lime-950/40 border border-lime-neon/40 rounded-xl flex items-center gap-2 text-xs text-lime-neon">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Form: Step 1 (Credentials & Captcha) */}
        {!otpRequested ? (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(e.target.value);
                        setIsCaptchaVerified(false);
                      }}
                      placeholder="Aarav"
                      required
                      className="w-full bg-dark-950 border border-dark-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-lime-neon"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                        setIsCaptchaVerified(false);
                      }}
                      placeholder="Sharma"
                      required
                      className="w-full bg-dark-950 border border-dark-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-lime-neon"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-lime-neon" />
                      Contact Number (India)
                    </span>
                    <span className="text-[10px] text-slate-500">+91 10-Digits</span>
                  </label>
                  <input
                    type="tel"
                    value={contactNumber}
                    onChange={(e) => {
                      setContactNumber(e.target.value);
                      setIsCaptchaVerified(false);
                    }}
                    placeholder="+91 98765 43210"
                    required
                    className="w-full bg-dark-950 border border-dark-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-lime-neon font-mono"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-lime-neon" />
                  Gmail Address
                </span>
                <span className="text-[10px] text-lime-neon font-semibold">@gmail.com</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setIsCaptchaVerified(false);
                }}
                placeholder="rohit.sharma@gmail.com"
                required
                className="w-full bg-dark-950 border border-dark-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-lime-neon"
              />
            </div>

            {/* Anti-Bot Swipe Captcha (Locked until fields are valid) */}
            <div className="pt-1">
              <SwipeCaptcha
                isVerified={isCaptchaVerified}
                disabled={isCaptchaDisabled}
                disabledMessage={disabledMessage}
                onVerified={() => setIsCaptchaVerified(true)}
              />
            </div>

            {/* Request OTP Button */}
            <button
              type="submit"
              disabled={isLoading || !isCaptchaVerified || isCaptchaDisabled}
              className={`w-full py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 ${
                isCaptchaVerified && !isCaptchaDisabled
                  ? 'bg-lime-neon hover:bg-lime-400 text-black shadow-neon cursor-pointer'
                  : 'bg-dark-800 text-slate-500 cursor-not-allowed border border-dark-700'
              }`}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-black" />
              ) : (
                <>
                  <span>Request Gmail OTP</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Form: Step 2 (OTP Verification) */
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="p-4 bg-dark-950 rounded-xl border border-dark-800 text-center">
              <KeyRound className="w-6 h-6 text-lime-neon mx-auto mb-1.5" />
              <p className="text-xs text-slate-300 font-medium">
                Enter the 6-digit OTP sent to your Gmail:
              </p>
              <p className="text-xs font-mono font-bold text-lime-neon">{email}</p>
              {devOtp && (
                <p className="text-[10px] text-slate-400 mt-2 bg-dark-800/80 p-1.5 rounded-lg border border-dark-700 font-mono">
                  Dev OTP Code: <span className="text-lime-neon font-bold">{devOtp}</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1 text-center">
                6-Digit Verification Code
              </label>
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                required
                className="w-full text-center tracking-[0.5em] text-lg font-mono font-bold bg-dark-950 border border-dark-700 rounded-xl py-2.5 text-lime-neon focus:outline-none focus:border-lime-neon"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || otpCode.length < 6}
              className="w-full bg-lime-neon hover:bg-lime-400 text-black font-extrabold text-xs uppercase tracking-wider py-3 rounded-xl transition shadow-neon flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-black" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>Verify OTP & Enter Studio</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setOtpRequested(false);
                setIsCaptchaVerified(false);
              }}
              className="w-full text-center text-[11px] text-slate-400 hover:text-white"
            >
              ← Back to change details
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
