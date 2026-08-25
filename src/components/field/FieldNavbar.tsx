"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export function FieldNavbar() {
  const router = useRouter();
  const { profile, user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <nav className="bg-emerald-950 text-white border-b border-emerald-900 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href="/field" className="flex items-center space-x-2">
              <span className="font-extrabold text-xl tracking-tight text-white">CivicFix</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-900 text-emerald-200 rounded-full border border-emerald-700">
                Field Operations
              </span>
            </Link>
            <div className="hidden md:flex space-x-6">
              <Link href="/field" className="text-sm font-medium text-emerald-200 hover:text-white transition-colors">
                Assigned Tasks
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {user && (
              <span className="text-xs text-emerald-300 hidden sm:inline">
                Worker: <strong className="text-white">{profile?.fullName || user.email}</strong>
              </span>
            )}
            <Link
              href="/"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-900 text-emerald-200 hover:text-white border border-emerald-800 transition-colors"
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
