"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export function Navbar() {
  const router = useRouter();
  const { user, profile, role, loading, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  const isResolvingRole = loading || (user && !role);

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center space-x-2">
              <span className="font-extrabold text-xl tracking-tight text-blue-600">CivicFix</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                AI Intelligence
              </span>
            </Link>

            {/* Navigation links based on resolved role */}
            <div className="hidden md:flex space-x-6">
              <Link href="/" className="text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors">
                Home
              </Link>

              {isResolvingRole ? (
                <div className="h-4 w-24 bg-slate-200 animate-pulse rounded my-auto" />
              ) : role === "MUNICIPAL_ADMIN" ? (
                <Link href="/admin" className="text-sm font-semibold text-purple-600 hover:text-purple-800 transition-colors">
                  Admin Console
                </Link>
              ) : role === "FIELD_WORKER" ? (
                <Link href="/field" className="text-sm font-semibold text-emerald-600 hover:text-emerald-800 transition-colors">
                  Field Tasks
                </Link>
              ) : (
                <>
                  <Link href="/report" className="text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors">
                    Report Issue
                  </Link>
                  <Link href="/my-reports" className="text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors">
                    My Reports
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {isResolvingRole ? (
              <div className="flex items-center space-x-2">
                <div className="h-8 w-24 bg-slate-100 animate-pulse rounded-lg" />
              </div>
            ) : user ? (
              <div className="flex items-center space-x-3">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-slate-900 line-clamp-1">
                    {profile?.fullName || user.email}
                  </p>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                    {role === "MUNICIPAL_ADMIN"
                      ? "Admin"
                      : role === "FIELD_WORKER"
                      ? "Field Worker"
                      : "Citizen"}
                  </span>
                </div>

                {role === "CITIZEN" && (
                  <Link
                    href="/report"
                    className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg shadow-sm text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                  >
                    + Report
                  </Link>
                )}

                {role === "MUNICIPAL_ADMIN" && (
                  <Link
                    href="/admin"
                    className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg shadow-sm text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors"
                  >
                    Console
                  </Link>
                )}

                {role === "FIELD_WORKER" && (
                  <Link
                    href="/field"
                    className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg shadow-sm text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                  >
                    Tasks
                  </Link>
                )}

                <button
                  onClick={handleSignOut}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-red-600 bg-slate-100 hover:bg-red-50 rounded-lg border border-slate-200 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link
                  href="/login"
                  className="px-4 py-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/report"
                  className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  + Report Issue
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
