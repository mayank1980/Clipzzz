import React, { useState } from 'react';
import { Mail, Phone, KeyRound, ArrowRight, CheckCircle2, AlertCircle, Loader2, Info, Sparkles } from 'lucide-react';
import SwipeCaptcha from './SwipeCaptcha';
import { api } from '../services/api';

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

  const isIndianPhoneValid = (phone) => {
    const clean = phone.replace(/[\s\-\(\)\+]/g, '');
    return /^((91)?[6-9]\d{9})$/.test(clean);
  };

  const isGmailValid = (em) => {
    const clean = em.toLowerCase().trim();
    return clean.endsWith('@gmail.com') || clean.endsWith('@googlemail.com');
  };

  const isSignupFormFilled =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 1 &&
    isIndianPhoneValid(contactNumber) &&
    isGmailValid(email);

  const isLoginFormFilled = isGmailValid(email);

  const isCaptchaDisabled = mode === 'signup' ? !isSignupFormFilled : !isLoginFormFilled;
  const disabledMessage =
    mode === 'signup'
      ? 'Complete details above to unlock'
      : 'Enter valid @gmail.com to unlock';

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
      setErrorMessage('Please slide the verification knob to proceed.');
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
    <div className="min-h-screen bg-canvas-cream flex flex-col justify-center items-center p-6 relative overflow-hidden font-sans">
      {/* Decorative Warm Orbital Arcs */}
      <div className="absolute top-10 left-1/4 w-[500px] h-[500px] rounded-full border border-light-orange/20 pointer-events-none orbital-arc"></div>
      <div className="absolute bottom-10 right-1/4 w-[600px] h-[600px] rounded-full border border-light-orange/15 pointer-events-none orbital-arc"></div>

      {/* Main Stadium Auth Card */}
      <div className="w-full max-w-md bg-white border border-border-cream rounded-stadium p-8 sm:p-10 shadow-card-elevated relative z-10">
        {/* Brand Gesture */}
        <div className="text-center mb-6">
          <div className="relative flex items-center justify-center w-12 h-8 mx-auto mb-3 select-none">
            <div className="w-7 h-7 rounded-full bg-mc-red shadow-sm"></div>
            <div className="w-7 h-7 rounded-full bg-mc-yellow -ml-3.5 mix-blend-multiply opacity-95"></div>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-black">
            CLIP<span className="text-signal-orange">IT</span>
          </h1>
          <div className="flex items-center justify-center gap-1.5 mt-1 text-[11px] uppercase font-extrabold tracking-wider text-slate-gray">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-orange"></span>
            <span>Find the moment. Clip it.</span>
          </div>
          <p className="text-[11px] text-slate-gray mt-1 font-medium">
            Long videos in. Perfect clips out.
          </p>
        </div>

        {/* Notice: Gmail Policy */}
        <div className="mb-5 p-3 bg-canvas-cream rounded-2xl border border-border-cream flex items-center gap-2 text-[11px] text-charcoal">
          <Info className="w-4 h-4 shrink-0 text-signal-orange" />
          <span>Official <strong>@gmail.com</strong> accounts supported via secure OTP.</span>
        </div>

        {/* Tab Switcher */}
        {!otpRequested && (
          <div className="grid grid-cols-2 p-1 bg-canvas-cream rounded-full border border-border-cream mb-6">
            <button
              type="button"
              onClick={() => handleResetFlow('login')}
              className={`py-2 text-xs font-bold rounded-full transition cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-ink-black shadow-sm'
                  : 'text-slate-gray hover:text-ink-black'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleResetFlow('signup')}
              className={`py-2 text-xs font-bold rounded-full transition cursor-pointer ${
                mode === 'signup'
                  ? 'bg-white text-ink-black shadow-sm'
                  : 'text-slate-gray hover:text-ink-black'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Error / Status Messages */}
        {errorMessage && (
          <div className="mb-5 p-3.5 bg-canvas-cream border border-signal-orange/60 rounded-2xl flex items-center gap-2.5 text-xs text-clay-brown">
            <AlertCircle className="w-4 h-4 text-signal-orange shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {statusMessage && (
          <div className="mb-5 p-3.5 bg-canvas-cream border border-border-cream rounded-2xl flex items-center gap-2.5 text-xs text-ink-black">
            <CheckCircle2 className="w-4 h-4 text-signal-orange shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Step 1: Credentials & Captcha */}
        {!otpRequested ? (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-gray mb-1 uppercase tracking-wide">
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
                      className="w-full bg-lifted-cream border border-dust-taupe rounded-full px-4 py-2.5 text-xs text-ink-black placeholder-slate-gray focus:outline-none focus:border-signal-orange shadow-inner"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-gray mb-1 uppercase tracking-wide">
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
                      className="w-full bg-lifted-cream border border-dust-taupe rounded-full px-4 py-2.5 text-xs text-ink-black placeholder-slate-gray focus:outline-none focus:border-signal-orange shadow-inner"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-gray mb-1 flex items-center justify-between uppercase tracking-wide">
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-signal-orange" />
                      Contact Number (India)
                    </span>
                    <span className="text-[10px] text-slate-gray font-normal">+91 10-Digits</span>
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
                    className="w-full bg-lifted-cream border border-dust-taupe rounded-full px-4 py-2.5 text-xs text-ink-black placeholder-slate-gray focus:outline-none focus:border-signal-orange shadow-inner font-mono"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-gray mb-1 flex items-center justify-between uppercase tracking-wide">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-signal-orange" />
                  Gmail Address
                </span>
                <span className="text-[10px] text-signal-orange font-bold">@gmail.com</span>
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
                className="w-full bg-lifted-cream border border-dust-taupe rounded-full px-4 py-3 text-xs text-ink-black placeholder-slate-gray focus:outline-none focus:border-signal-orange shadow-inner"
              />
            </div>

            {/* Anti-Bot Swipe Captcha */}
            <div className="pt-2">
              <SwipeCaptcha
                isVerified={isCaptchaVerified}
                disabled={isCaptchaDisabled}
                disabledMessage={disabledMessage}
                onVerified={() => setIsCaptchaVerified(true)}
              />
            </div>

            {/* Request OTP Button: Signature Ink Black Pill */}
            <button
              type="submit"
              disabled={isLoading || !isCaptchaVerified || isCaptchaDisabled}
              className={`w-full py-3.5 rounded-cta font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 ${
                isCaptchaVerified && !isCaptchaDisabled
                  ? 'bg-ink-black hover:bg-black text-white shadow-card-soft cursor-pointer hover:scale-[1.01]'
                  : 'bg-canvas-cream text-slate-gray cursor-not-allowed border border-border-cream'
              }`}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-signal-orange" />
              ) : (
                <>
                  <span>Request Gmail OTP</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Step 2: OTP Verification */
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="p-4 bg-canvas-cream rounded-2xl border border-border-cream text-center">
              <KeyRound className="w-6 h-6 text-signal-orange mx-auto mb-1.5" />
              <p className="text-xs text-charcoal font-medium">
                Enter the 6-digit verification code sent to:
              </p>
              <p className="text-xs font-mono font-bold text-ink-black mt-0.5">{email}</p>
              {devOtp && (
                <p className="text-[10px] text-slate-gray mt-2 bg-white p-2 rounded-xl border border-border-cream font-mono shadow-sm">
                  Dev OTP Code: <span className="text-signal-orange font-bold">{devOtp}</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-gray mb-1.5 text-center uppercase tracking-wide">
                6-Digit Verification Code
              </label>
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                required
                className="w-full text-center tracking-[0.5em] text-lg font-mono font-bold bg-lifted-cream border border-dust-taupe rounded-full py-3 text-ink-black focus:outline-none focus:border-signal-orange shadow-inner"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || otpCode.length < 6}
              className="w-full bg-ink-black hover:bg-black text-white font-bold text-xs uppercase tracking-wider py-3.5 rounded-cta transition shadow-card-soft flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-signal-orange" />
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
              className="w-full text-center text-[11px] text-slate-gray hover:text-ink-black font-semibold cursor-pointer pt-1"
            >
              ← Back to change details
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
