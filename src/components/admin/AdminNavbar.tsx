"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export function AdminNavbar() {
  const router = useRouter();
  const { profile, user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <nav className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href="/admin" className="flex items-center space-x-2">
              <span className="font-extrabold text-xl tracking-tight text-white">CivicFix</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 bg-blue-900 text-blue-200 rounded-full border border-blue-700">
                Admin Ops
              </span>
            </Link>
            <div className="hidden md:flex space-x-6">
              <Link href="/admin" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
                Command Center
              </Link>
              <Link href="/admin/issues" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
                Issue Queue
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {user && (
              <span className="text-xs text-slate-400 hidden sm:inline">
                Admin: <strong className="text-white">{profile?.fullName || user.email}</strong>
              </span>
            )}
            <Link
              href="/"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition-colors"
            >
              🌐 Public Site
            </Link>
            <button
              onClick={handleSignOut}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-950/60 text-red-300 hover:text-white border border-red-800/50 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
