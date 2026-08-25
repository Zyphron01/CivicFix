"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/services/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types/civic";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams?.get("redirect") || null;

  const { user, role, loading: authLoading, refreshProfile } = useAuth();

  const [mode, setMode] = useState<"SIGN_IN" | "SIGN_UP">("SIGN_IN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const routeByRole = React.useCallback((targetRole: UserRole | null) => {
    if (redirectPath) {
      router.push(redirectPath);
    } else if (targetRole === "MUNICIPAL_ADMIN") {
      router.push("/admin");
    } else if (targetRole === "FIELD_WORKER") {
      router.push("/field");
    } else {
      router.push("/");
    }
  }, [redirectPath, router]);

  // If already logged in, redirect based on role
  useEffect(() => {
    if (!authLoading && user && role) {
      routeByRole(role);
    }
  }, [user, role, authLoading, routeByRole]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase authentication is not configured.");
      return;
    }

    if (!email || !password) {
      setError("Please fill in all required fields.");
      return;
    }

    if (mode === "SIGN_UP" && !fullName.trim()) {
      setError("Full Name is required for registration.");
      return;
    }

    setFormLoading(true);

    try {
      if (mode === "SIGN_UP") {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (signUpErr) throw signUpErr;

        if (data.session && data.user) {
          setMessage("Account created successfully! Redirecting...");
          const updatedProfile = await refreshProfile(data.user.id);
          routeByRole(updatedProfile?.role || "CITIZEN");
        } else {
          setMessage("Registration successful! Please check your email to confirm your account or sign in.");
          setMode("SIGN_IN");
        }
      } else {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInErr) throw signInErr;

        if (data.session && data.user) {
          setMessage("Signed in successfully! Redirecting...");
          const updatedProfile = await refreshProfile(data.user.id);
          routeByRole(updatedProfile?.role || "CITIZEN");
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(err.message || "An error occurred during authentication.");
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <Link href="/" className="inline-flex items-center space-x-2">
          <span className="font-extrabold text-3xl tracking-tight text-blue-600">CivicFix</span>
        </Link>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          {mode === "SIGN_IN" ? "Sign in to your account" : "Create a new Citizen account"}
        </h2>
        <p className="text-xs text-slate-500">
          {mode === "SIGN_IN"
            ? "Access your reported issues, track field status, or access operational console"
            : "Join CivicFix to report civic infrastructure issues and track verified resolutions"}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm border border-slate-200 sm:rounded-2xl sm:px-10 space-y-6">
          {/* Mode Switcher Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setMode("SIGN_IN");
                setError(null);
                setMessage(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                mode === "SIGN_IN" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("SIGN_UP");
                setError(null);
                setMessage(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                mode === "SIGN_UP" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
              {error}
            </div>
          )}

          {message && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "SIGN_UP" && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={formLoading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-colors shadow-sm disabled:opacity-50 mt-2"
            >
              {formLoading
                ? "Processing..."
                : mode === "SIGN_IN"
                ? "Sign In"
                : "Create Citizen Account"}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 text-center">
            <Link href="/" className="text-xs font-semibold text-slate-500 hover:text-blue-600">
              ← Return to CivicFix Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
