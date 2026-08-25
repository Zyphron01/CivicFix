"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/services/supabaseClient";
import { UserProfile, UserRole } from "@/types/civic";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  profileError: string | null;
  signOut: () => Promise<void>;
  refreshProfile: (userId?: string) => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  role: null,
  loading: true,
  profileError: null,
  signOut: async () => {},
  refreshProfile: async () => null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    if (!supabase || !isSupabaseConfigured) return null;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching user profile:", error);
        setProfileError(error.message);
        return null;
      }

      if (data) {
        const userProfile: UserProfile = {
          id: data.id,
          fullName: data.full_name || "Anonymous Citizen",
          role: (data.role as UserRole) || "CITIZEN",
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
        setProfile(userProfile);
        setRole(userProfile.role);
        setProfileError(null);
        return userProfile;
      }

      // Default fallback profile if row not created yet
      const fallbackProfile: UserProfile = {
        id: userId,
        fullName: "Citizen",
        role: "CITIZEN",
      };
      setProfile(fallbackProfile);
      setRole("CITIZEN");
      return fallbackProfile;
    } catch (err: any) {
      console.error("Failed to fetch profile:", err);
      setProfileError(err.message || "Failed to load profile");
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;
    let authInitialized = false;

    async function handleSessionUpdate(currentSession: Session | null) {
      if (!mounted) return;
      setSession(currentSession);
      const currentUser = currentSession?.user || null;
      setUser(currentUser);

      if (currentUser) {
        await fetchProfile(currentUser.id);
      } else {
        setProfile(null);
        setRole(null);
      }

      if (mounted) {
        setLoading(false);
        authInitialized = true;
      }
    }

    if (!supabase || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // 1. Initial Session check
    supabase.auth.getSession().then(({ data: { session: initialSession }, error }) => {
      if (!mounted) return;
      if (error) {
        console.error("Error getting auth session:", error);
        setLoading(false);
        return;
      }
      if (!authInitialized) {
        handleSessionUpdate(initialSession);
      }
    });

    // 2. Auth State Change Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;
        if (event === "SIGNED_OUT") {
          setSession(null);
          setUser(null);
          setProfile(null);
          setRole(null);
          setLoading(false);
          return;
        }

        await handleSessionUpdate(newSession);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setLoading(true);
    try {
      if (supabase && isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error("Error signing out:", err);
    } finally {
      setSession(null);
      setUser(null);
      setProfile(null);
      setRole(null);
      setLoading(false);
    }
  };

  const refreshProfile = async (userId?: string): Promise<UserProfile | null> => {
    const targetId = userId || user?.id;
    if (targetId) {
      return await fetchProfile(targetId);
    }
    return null;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        loading,
        profileError,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
