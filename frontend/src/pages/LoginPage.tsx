import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, KeyRound, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { Button, Spinner } from '@/components/ui';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAppStore();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError('');

    try {
      await login(code);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Cod acces invalid');
      setCode('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Allow only numbers
    if (!/[0-9]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Enter') {
      e.preventDefault();
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px] opacity-50" />

      <div className="relative w-full max-w-md">
        {/* Logo card */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-red-500 to-red-700 px-8 py-10 text-center">
            <div className="w-20 h-20 mx-auto bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm mb-4">
              <Wallet className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">La Nuci</h1>
            <p className="text-red-100 mt-1">Management Daily Restaurant</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-8">
            <div className="text-center mb-8">
              <KeyRound className="w-8 h-8 text-stone-400 mx-auto mb-3" />
              <p className="text-stone-600 dark:text-stone-400">
                Introduceți codul de acces sau scanați cardul
              </p>
            </div>

            {/* PIN input */}
            <div className="mb-6">
              <input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="••••"
                className="w-full text-center text-3xl tracking-[0.5em] py-4 bg-stone-50 dark:bg-stone-800 border-2 border-stone-200 dark:border-stone-700 rounded-xl focus:border-red-500 focus:ring-0 transition-colors"
                autoComplete="off"
                disabled={loading}
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="mb-6 flex items-center gap-2 text-red-500 text-sm justify-center animate-slide-down">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit button */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              loading={loading}
              disabled={!code.trim()}
            >
              {loading ? 'Se verifică...' : 'Autentificare'}
            </Button>

            {/* Help text */}
            <p className="text-center text-xs text-stone-400 mt-6">
              Cod implicit admin: 1234
            </p>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-stone-400 mt-6">
          © 2024 Restaurant Management System
        </p>
      </div>
    </div>
  );
};
