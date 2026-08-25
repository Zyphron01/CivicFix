"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Navbar } from "@/components/layout/Navbar";
import dynamic from "next/dynamic";
import { IssueCategory, LocationSource } from "@/types/civic";
import { AITriageAssessment } from "@/types/ai";
import { civicService } from "@/services/civicService";
import {
  locationService,
  PRECISION_TARGET_METERS,
  ACCEPTABLE_GPS_METERS,
  MAX_ACQUISITION_MS,
  type LiveReading,
  type AcceptedLiveLocation,
  type GeolocationApiError,
  type WatchHandle,
} from "@/services/locationService";
import { supabase } from "@/services/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { RouteGuard } from "@/components/auth/RouteGuard";

const LocationPickerMap = dynamic(() => import("@/components/civic/LocationPickerMap"), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-slate-100 animate-pulse rounded-2xl flex items-center justify-center text-xs text-slate-400 font-mono">
      Loading Map...
    </div>
  ),
});

const CATEGORIES: { value: IssueCategory; label: string; desc: string }[] = [
  { value: "POTHOLE", label: "Pothole / Road Damage", desc: "Crater, broken asphalt, dangerous dip" },
  { value: "GARBAGE", label: "Garbage Dump / Uncollected Waste", desc: "Overflowing bin, dumped trash bag" },
  { value: "DRAINAGE", label: "Blocked Drainage / Overflow", desc: "Clogged storm drain, sewage overflow" },
  { value: "STREETLIGHT", label: "Non-functional Streetlight", desc: "Dark pole, flickering LED, broken fixture" },
  { value: "WATER_LEAKAGE", label: "Water Pipe Leakage", desc: "Burst pipeline, continuous water wastage" },
  { value: "OTHER", label: "Other Civic Issue", desc: "General municipal infrastructure issue" },
];

// ─── Location State Machine ──────────────────────────────────────────────────
//
// Allowed transitions:
//   IDLE → CHECKING_PERMISSION → ACQUIRING_GPS → PRECISE_LOCATION_FOUND
//                                              → TIMEOUT
//                                              → PERMISSION_DENIED
//                                              → UNSUPPORTED
//   Any state → MANUAL_SELECTION (user clicks map)
//   PRECISE_LOCATION_FOUND | TIMEOUT | PERMISSION_DENIED → IDLE (user resets)
//
type LocationState =
  | { status: "IDLE" }
  | { status: "CHECKING_PERMISSION" }
  | {
      status: "ACQUIRING_GPS";
      /** The most recent reading received from the device (may be coarse). */
      latestReading: LiveReading | null;
      /** The best (most accurate) reading seen so far in this session. */
      bestReading: LiveReading | null;
      /** Elapsed seconds since acquisition started, for the progress display. */
      elapsedSecs: number;
    }
  | { status: "PRECISE_LOCATION_FOUND"; result: AcceptedLiveLocation }
  | { status: "TIMEOUT"; bestReading: LiveReading | null }
  | { status: "PERMISSION_DENIED"; permissionState: string }
  | { status: "UNSUPPORTED"; message: string }
  | { status: "MANUAL_SELECTION"; latitude: number; longitude: number };

export default function ReportPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [category, setCategory] = useState<IssueCategory>("POTHOLE");
  const [title, setTitle] = useState("");
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [description, setDescription] = useState("");

  /**
   * Location state machine.
   * IDLE on init — no coordinates, no auto-detection on page load.
   *
   * The ONLY ways coordinates enter this component:
   *  1. watchPosition session → PRECISE_LOCATION_FOUND (accuracy validated)
   *  2. User clicks/drags map → MANUAL_SELECTION
   */
  const [locationState, setLocationState] = useState<LocationState>({ status: "IDLE" });

  /** Derived address text — only populated after PRECISE_LOCATION_FOUND or MANUAL_SELECTION. */
  const [addressText, setAddressText] = useState("");
  const [wardId, setWardId] = useState("Unzoned / Ward Pending Verification");

  // File upload
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Nearby duplicates
  const [nearbyDuplicates, setNearbyDuplicates] = useState<any[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  // Submit flow
  const [step, setStep] = useState<"FORM" | "ANALYZING" | "SUCCESS">("FORM");
  const [analysisResult, setAnalysisResult] = useState<AITriageAssessment | null>(null);
  const [createdId, setCreatedId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Reverse geocoding in progress
  const [geocoding, setGeocoding] = useState(false);

  // ─── Watcher lifecycle refs ──────────────────────────────────────────────────
  //
  // These refs survive re-renders and hold the active watcher handle and timers.
  // They are used for mandatory cleanup on unmount and on new acquisition start.

  /** Active GPS watcher handle. null when no watch is running. */
  const watchHandleRef = useRef<WatchHandle | null>(null);

  /** Page-level acquisition timeout. Must be cleared on accept, error, cancel, or unmount. */
  const watchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Elapsed-second display interval. */
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Request ID counter. Incremented on each new acquisition attempt.
   * Used to discard stale async results if the user clicks multiple times quickly.
   */
  const requestIdRef = useRef(0);

  /**
   * Mandatory cleanup: stop any active watcher and timers when the component unmounts.
   * This prevents battery drain, memory leaks, and ghost state updates.
   */
  useEffect(() => {
    return () => {
      watchHandleRef.current?.stop();
      if (watchTimeoutRef.current) clearTimeout(watchTimeoutRef.current);
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    };
  }, []);

  // ─── Derived coordinate values ───────────────────────────────────────────────
  //
  // acceptedLat / acceptedLng are ONLY non-null for PRECISE_LOCATION_FOUND and MANUAL_SELECTION.
  // All other states yield null, which prevents coordinates from reaching the submit flow.

  const acceptedLat =
    locationState.status === "PRECISE_LOCATION_FOUND"
      ? locationState.result.latitude
      : locationState.status === "MANUAL_SELECTION"
      ? locationState.latitude
      : null;

  const acceptedLng =
    locationState.status === "PRECISE_LOCATION_FOUND"
      ? locationState.result.longitude
      : locationState.status === "MANUAL_SELECTION"
      ? locationState.longitude
      : null;

  const acceptedAccuracy =
    locationState.status === "PRECISE_LOCATION_FOUND"
      ? locationState.result.accuracyMeters
      : undefined;

  const locationSource: LocationSource | null =
    locationState.status === "PRECISE_LOCATION_FOUND"
      ? "LIVE_PRECISE_DEVICE"
      : locationState.status === "MANUAL_SELECTION"
      ? "MANUAL_MAP_SELECTION"
      : null;

  // ─── Internal helpers ────────────────────────────────────────────────────────

  /** Stop any currently active watcher and clear all associated timers. */
  const stopActiveWatcher = () => {
    watchHandleRef.current?.stop();
    watchHandleRef.current = null;
    if (watchTimeoutRef.current) {
      clearTimeout(watchTimeoutRef.current);
      watchTimeoutRef.current = null;
    }
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  };

  const checkNearbyDuplicates = async (lat: number, lng: number) => {
    if (!civicService.findNearbyDuplicates) return;
    try {
      const dupes = await civicService.findNearbyDuplicates(category, lat, lng, 250);
      if (dupes && dupes.length > 0) {
        setNearbyDuplicates(dupes);
        setShowDuplicateWarning(true);
      } else {
        setNearbyDuplicates([]);
        setShowDuplicateWarning(false);
      }
    } catch {
      // Non-fatal
    }
  };

  /**
   * Reverse-geocode validated coordinates and populate address and derived ward fields.
   * Must ONLY be called with accepted or manually-selected coordinates.
   */
  const applyConfirmedLocation = async (lat: number, lng: number) => {
    setAddressText("");
    setGeocoding(true);
    try {
      const detailed = await locationService.reverseGeocodeDetailed(lat, lng);
      setAddressText(detailed.formattedAddress);
      if (detailed.derivedWard) {
        setWardId(detailed.derivedWard);
      }
    } catch {
      setAddressText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } finally {
      setGeocoding(false);
    }
    checkNearbyDuplicates(lat, lng);
  };

  // ─── Primary GPS acquisition handler ─────────────────────────────────────────

  /**
   * User explicitly clicked "Use My Live Location".
   *
   * This is the ONLY function that calls navigator.geolocation.watchPosition (via the service).
   * It is NEVER called automatically on page load.
   *
   * Lifecycle:
   * 1. Cancel any existing watcher.
   * 2. Set state → CHECKING_PERMISSION.
   * 3. Await startAccuracySeekingWatch() — reads permission state, starts watcher.
   * 4. Store the WatchHandle in a ref.
   * 5. Start the MAX_ACQUISITION_MS page-level timeout.
   * 6. Progressive onReading callbacks update ACQUIRING_GPS state.
   * 7. onAccepted fires when precision target met → stop timeout → PRECISE_LOCATION_FOUND.
   * 8. Timeout fires → evaluate best reading → PRECISE_LOCATION_FOUND or TIMEOUT.
   * 9. onError fires → stop timeout → PERMISSION_DENIED or UNSUPPORTED.
   */
  const handleRequestLiveLocation = async () => {
    // Assign a new request ID so any stale async resolutions are discarded
    const myRequestId = ++requestIdRef.current;

    // Cancel any currently active watcher and its timers
    stopActiveWatcher();

    // Clear previous location result and address
    setAddressText("");
    setNearbyDuplicates([]);
    setShowDuplicateWarning(false);

    // Transition to CHECKING_PERMISSION while we await the permission read + watcher start
    setLocationState({ status: "CHECKING_PERMISSION" });

    let handle: WatchHandle;
    try {
      handle = await locationService.startAccuracySeekingWatch({
        /**
         * Called on every new position reading from the device.
         * Updates the ACQUIRING_GPS state with live numbers.
         * Note: if precision is met, onAccepted fires immediately after this.
         */
        onReading: (reading, bestSoFar) => {
          if (requestIdRef.current !== myRequestId) return;
          setLocationState((prev) => ({
            status: "ACQUIRING_GPS",
            latestReading: reading,
            bestReading: bestSoFar,
            elapsedSecs:
              prev.status === "ACQUIRING_GPS" ? prev.elapsedSecs : 0,
          }));
        },

        /**
         * Called when a reading meets PRECISION_TARGET_METERS.
         * The service has already called clearWatch() internally.
         */
        onAccepted: (result) => {
          if (requestIdRef.current !== myRequestId) return;
          stopActiveWatcher(); // clear page-level timeout + interval
          setLocationState({ status: "PRECISE_LOCATION_FOUND", result });
          applyConfirmedLocation(result.latitude, result.longitude);
        },

        /**
         * Called when the Geolocation API reports a hard error.
         * The service has already called clearWatch() internally.
         */
        onError: (apiError) => {
          if (requestIdRef.current !== myRequestId) return;
          stopActiveWatcher();
          if (apiError.code === 1) {
            // PERMISSION_DENIED
            setLocationState({
              status: "PERMISSION_DENIED",
              permissionState: apiError.permissionState,
            });
          } else {
            // POSITION_UNAVAILABLE (2) or TIMEOUT (3)
            setLocationState({
              status: "UNSUPPORTED",
              message: apiError.message,
            });
          }
        },
      });
    } catch (err: any) {
      // startAccuracySeekingWatch throws synchronously only when geolocation is unavailable
      if (requestIdRef.current !== myRequestId) return;
      stopActiveWatcher();
      setLocationState({
        status: "UNSUPPORTED",
        message: err.message ?? "Geolocation is not supported by this browser.",
      });
      return;
    }

    // If another click happened while we were awaiting, discard this handle
    if (requestIdRef.current !== myRequestId) {
      handle.stop();
      return;
    }

    // Store the handle for cleanup
    watchHandleRef.current = handle;

    // Transition from CHECKING_PERMISSION → ACQUIRING_GPS (0 readings yet)
    setLocationState({
      status: "ACQUIRING_GPS",
      latestReading: null,
      bestReading: null,
      elapsedSecs: 0,
    });

    // Start the elapsed-second display counter
    const startTime = Date.now();
    elapsedIntervalRef.current = setInterval(() => {
      setLocationState((prev) =>
        prev.status === "ACQUIRING_GPS"
          ? { ...prev, elapsedSecs: Math.floor((Date.now() - startTime) / 1000) }
          : prev
      );
    }, 1000);

    // Start the maximum acquisition timeout
    watchTimeoutRef.current = setTimeout(() => {
      if (requestIdRef.current !== myRequestId) return;

      const best = handle.getBestReading();
      stopActiveWatcher(); // calls handle.stop() + clears interval

      if (best && best.accuracyMeters <= ACCEPTABLE_GPS_METERS) {
        // Best reading within acceptable range — accept it
        const acceptedResult: AcceptedLiveLocation = {
          accepted: true,
          latitude: Number(best.latitude.toFixed(6)),
          longitude: Number(best.longitude.toFixed(6)),
          accuracyMeters: best.accuracyMeters,
          capturedAt: best.timestamp,
          source: "LIVE_PRECISE_DEVICE",
          permissionState: handle.permissionState,
          rawCoords: best.rawCoords,
        };
        setLocationState({ status: "PRECISE_LOCATION_FOUND", result: acceptedResult });
        applyConfirmedLocation(best.latitude, best.longitude);
      } else {
        // No acceptable reading obtained — timeout
        setLocationState({ status: "TIMEOUT", bestReading: best });
      }
    }, MAX_ACQUISITION_MS);
  };

  /**
   * User cancelled GPS acquisition explicitly.
   */
  const handleCancelAcquisition = () => {
    stopActiveWatcher();
    setLocationState({ status: "IDLE" });
  };

  /**
   * User clicked or dragged on the map — manual location selection.
   * Cancels any active GPS watcher.
   * Always tagged as MANUAL_MAP_SELECTION, never as GPS.
   */
  const handleManualLocationSelected = async (lat: number, lng: number) => {
    stopActiveWatcher();
    setLocationState({ status: "MANUAL_SELECTION", latitude: lat, longitude: lng });
    setAddressText("");
    setNearbyDuplicates([]);
    setShowDuplicateWarning(false);
    await applyConfirmedLocation(lat, lng);
  };

  // ─── Image upload ────────────────────────────────────────────────────────────

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setError("Please select a valid image file (JPEG, PNG, or WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image file size must be less than 5MB.");
      return;
    }
    setError(null);
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !description.trim()) {
      setError("Please provide both a title and detailed description.");
      return;
    }

    if (acceptedLat === null || acceptedLng === null) {
      setError(
        "Please select a location before submitting. Use 'Use My Live Location' or click on the map."
      );
      return;
    }

    if (!addressText.trim()) {
      setError("Please enter the street address or location landmark.");
      return;
    }

    if (!imageFile) {
      setError("Please upload an evidence photo of the civic issue.");
      return;
    }

    setStep("ANALYZING");

    try {
      let imageStorageRef = "";
      if (civicService.uploadImage) {
        const uploadRes = await civicService.uploadImage(imageFile, "reports");
        if (uploadRes?.path) imageStorageRef = uploadRes.path;
        else if (uploadRes?.url) imageStorageRef = uploadRes.url;
      }

      if (!imageStorageRef) {
        throw new Error("Failed to upload evidence image file to storage.");
      }

      let token = "";
      if (supabase) {
        const { data: sessionData } = await supabase.auth.getSession();
        token = sessionData?.session?.access_token || "";
      }
      if (!token) throw new Error("Authentication session required to evaluate AI triage.");

      const clientController = new AbortController();
      const clientTimeout = setTimeout(() => clientController.abort(), 65000);

      let triageResponse: Response;
      try {
        triageResponse = await fetch("/api/ai/triage", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            category,
            latitude: acceptedLat,
            longitude: acceptedLng,
            addressText: addressText.trim(),
            wardId,
            imageUrl: imageStorageRef,
          }),
          signal: clientController.signal,
        });
      } catch (clientFetchErr: any) {
        clearTimeout(clientTimeout);
        if (clientFetchErr.name === "AbortError") {
          throw new Error("AI Triage request timed out after 65 seconds. Please try again.");
        }
        throw clientFetchErr;
      } finally {
        clearTimeout(clientTimeout);
      }

      if (!triageResponse.ok) {
        let errMsg = "Multimodal AI Triage evaluation failed.";
        try {
          const errJson = await triageResponse.json();
          if (errJson?.error) errMsg = errJson.error;
        } catch {}
        throw new Error(errMsg);
      }

      const validatedAssessment: AITriageAssessment = await triageResponse.json();

      const newIssue = await civicService.createReport({
        citizenId: user?.id || "",
        title: title.trim(),
        description: description.trim(),
        category,
        latitude: acceptedLat,
        longitude: acceptedLng,
        addressText: addressText.trim(),
        wardId,
        imageUrl: imageStorageRef,
        locationSource: locationSource || undefined,
        locationAccuracy: acceptedAccuracy,
        aiAssessment: validatedAssessment,
      });

      setAnalysisResult(validatedAssessment);
      setCreatedId(newIssue.id);
      setStep("SUCCESS");
    } catch (err: any) {
      console.error("Create report error:", err);
      setError(err.message || "Failed to submit report. Please try again.");
      setStep("FORM");
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  // Detect insecure context for diagnostic warning
  const secureContextInfo =
    typeof window !== "undefined" ? locationService.checkSecureContext() : null;

  const isAcquiring =
    locationState.status === "CHECKING_PERMISSION" ||
    locationState.status === "ACQUIRING_GPS";

  return (
    <RouteGuard requireAuth={true}>
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
        <Navbar />

        <main className="flex-1 max-w-3xl mx-auto px-4 py-10 w-full">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8">
            {step === "FORM" && (
              <form onSubmit={handleSubmit} className="space-y-8">
                <div>
                  <h1 className="text-2xl font-extrabold text-slate-900">Report a Civic Issue</h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Submit an issue with genuine photo evidence and location for AI triage and
                    departmental action.
                  </p>
                </div>

                {/* Insecure context development warning */}
                {secureContextInfo && !secureContextInfo.isSecure && (
                  <div className="p-3 bg-orange-50 border border-orange-300 rounded-xl text-xs text-orange-800 font-medium">
                    {secureContextInfo.warning}
                  </div>
                )}

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl font-medium">
                    {error}
                  </div>
                )}

                {/* 1. Category */}
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-slate-800">
                    1. Select Issue Category
                  </label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => {
                          setCategory(cat.value);
                          if (!titleManuallyEdited) setTitle(cat.label);
                        }}
                        className={`text-left p-4 rounded-xl border transition-all ${
                          category === cat.value
                            ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-100"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <p className="font-bold text-sm text-slate-900">{cat.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{cat.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Title & Description */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-800 mb-1">
                      Issue Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        setTitleManuallyEdited(!!e.target.value.trim());
                      }}
                      placeholder="e.g. Large pothole blocking right lane"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-800 mb-1">
                      Detailed Description
                    </label>
                    <textarea
                      rows={4}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Provide exact landmarks, dimensions, hazard details..."
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                      required
                    />
                  </div>
                </div>

                {/* 3. Evidence Photo */}
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-bold text-slate-800">
                      2. Attach Evidence Photo (Required)
                    </label>
                    <span className="text-xs text-slate-500 font-medium">Max 5MB (JPG, PNG, WebP)</span>
                  </div>
                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 text-center transition-colors bg-slate-50/50">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/jpg"
                        onChange={handleImageFileChange}
                        id="evidence-file-input"
                        className="hidden"
                      />
                      <label htmlFor="evidence-file-input" className="cursor-pointer space-y-2 block">
                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto font-bold text-xl">
                          📷
                        </div>
                        <p className="text-sm font-bold text-slate-800">
                          {imageFile ? imageFile.name : "Click to Upload Photo from Camera / Device"}
                        </p>
                        <p className="text-xs text-slate-500">
                          Uploads directly to private Supabase Storage bucket for Multimodal AI Triage
                        </p>
                      </label>
                    </div>

                    {imagePreviewUrl && (
                      <div className="relative rounded-xl overflow-hidden border border-blue-200 h-48 max-w-md mx-auto shadow-sm">
                        <Image
                          src={imagePreviewUrl}
                          alt="Selected evidence preview"
                          fill
                          className="object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setImageFile(null);
                            setImagePreviewUrl(null);
                          }}
                          className="absolute top-2 right-2 px-2.5 py-1 bg-red-600 text-white rounded-lg text-xs font-bold shadow"
                        >
                          Remove Photo
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Location Section */}
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-800">3. Issue Location</label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Click{" "}
                      <strong>&quot;Use My Live Location&quot;</strong> to request GPS from your device
                      (works best outdoors on a mobile phone), or click the map below to manually
                      place a pin.
                    </p>
                  </div>

                  {/* Primary action + cancel button row */}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      id="use-live-location-btn"
                      onClick={handleRequestLiveLocation}
                      disabled={isAcquiring}
                      className="inline-flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <span>📍</span>
                      <span>
                        {locationState.status === "CHECKING_PERMISSION"
                          ? "Checking Permission..."
                          : locationState.status === "ACQUIRING_GPS"
                          ? "Acquiring GPS..."
                          : "Use My Live Location"}
                      </span>
                    </button>

                    {isAcquiring && (
                      <button
                        type="button"
                        id="cancel-acquisition-btn"
                        onClick={handleCancelAcquisition}
                        className="inline-flex items-center space-x-2 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-sm font-bold transition-colors"
                      >
                        <span>✕</span>
                        <span>Cancel</span>
                      </button>
                    )}
                  </div>

                  {/* ── State banners ── */}

                  {/* CHECKING_PERMISSION */}
                  {locationState.status === "CHECKING_PERMISSION" && (
                    <div className="p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs flex items-center space-x-3 animate-pulse">
                      <span className="text-lg">🔐</span>
                      <div>
                        <p className="font-bold">Checking location permission...</p>
                        <p className="text-[11px] text-blue-600 mt-0.5">
                          If permission is &quot;prompt&quot;, your browser will show its native
                          permission dialog. If already granted, acquisition starts immediately.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ACQUIRING_GPS */}
                  {locationState.status === "ACQUIRING_GPS" && (
                    <div className="p-4 bg-blue-50 border border-blue-300 text-blue-900 rounded-xl text-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
                          </span>
                          <span className="font-bold text-blue-900">
                            GPS Acquisition Active
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-blue-600">
                          {locationState.elapsedSecs}s / {MAX_ACQUISITION_MS / 1000}s max
                        </span>
                      </div>

                      {/* Accuracy progress bar */}
                      <div>
                        <div className="flex justify-between text-[10px] text-blue-600 mb-1">
                          <span>Accuracy progress</span>
                          <span>
                            Target: ≤{PRECISION_TARGET_METERS}m · Accept: ≤{ACCEPTABLE_GPS_METERS}m
                          </span>
                        </div>
                        {/* Visual accuracy meter */}
                        {locationState.bestReading ? (
                          <div className="w-full bg-blue-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all duration-500 ${
                                locationState.bestReading.accuracyMeters <= PRECISION_TARGET_METERS
                                  ? "bg-emerald-500"
                                  : locationState.bestReading.accuracyMeters <= ACCEPTABLE_GPS_METERS
                                  ? "bg-amber-400"
                                  : "bg-red-400"
                              }`}
                              style={{
                                width: `${Math.max(
                                  5,
                                  Math.min(
                                    100,
                                    100 -
                                      ((locationState.bestReading.accuracyMeters - PRECISION_TARGET_METERS) /
                                        (5000 - PRECISION_TARGET_METERS)) *
                                        100
                                  )
                                )}%`,
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-full bg-blue-100 rounded-full h-2 animate-pulse" />
                        )}
                      </div>

                      {/* Live readings display */}
                      <div className="grid grid-cols-2 gap-2 bg-blue-100/60 rounded-lg p-2.5 font-mono text-[10px]">
                        <div>
                          <span className="text-blue-600">Latest reading:</span>
                          <div className="font-bold text-blue-900 mt-0.5">
                            {locationState.latestReading
                              ? `±${locationState.latestReading.accuracyMeters}m`
                              : "Waiting for first reading..."}
                          </div>
                        </div>
                        <div>
                          <span className="text-blue-600">Best so far:</span>
                          <div
                            className={`font-bold mt-0.5 ${
                              locationState.bestReading
                                ? locationState.bestReading.accuracyMeters <= PRECISION_TARGET_METERS
                                  ? "text-emerald-600"
                                  : locationState.bestReading.accuracyMeters <= ACCEPTABLE_GPS_METERS
                                  ? "text-amber-600"
                                  : "text-red-600"
                                : "text-blue-900"
                            }`}
                          >
                            {locationState.bestReading
                              ? `±${locationState.bestReading.accuracyMeters}m`
                              : "—"}
                          </div>
                        </div>
                      </div>

                      <p className="text-[11px] text-blue-700">
                        {locationState.latestReading
                          ? locationState.latestReading.accuracyMeters > ACCEPTABLE_GPS_METERS
                            ? "📶 Low accuracy (likely network estimate). Waiting for GPS improvement. Go outdoors for best results."
                            : `📡 Reading improving — current best ±${locationState.bestReading?.accuracyMeters}m`
                          : "📡 Waiting for first reading from device..."}
                      </p>
                    </div>
                  )}

                  {/* PRECISE_LOCATION_FOUND */}
                  {locationState.status === "PRECISE_LOCATION_FOUND" && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-800 flex items-center space-x-1">
                          <span>✓</span>
                          <span>GPS Location Accepted</span>
                        </span>
                        <span className="bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase">
                          LIVE_PRECISE_DEVICE
                        </span>
                      </div>
                      <p className="font-mono">
                        {locationState.result.latitude.toFixed(6)},{" "}
                        {locationState.result.longitude.toFixed(6)} — accuracy ±
                        {locationState.result.accuracyMeters}m
                      </p>
                      <p className="text-emerald-700 text-[11px]">
                        {locationState.result.accuracyMeters <= PRECISION_TARGET_METERS
                          ? `✓ Within precision target (≤${PRECISION_TARGET_METERS}m) — watcher stopped immediately.`
                          : `✓ Within acceptable range (≤${ACCEPTABLE_GPS_METERS}m) — accepted at end of acquisition window.`}
                      </p>
                    </div>
                  )}

                  {/* TIMEOUT */}
                  {locationState.status === "TIMEOUT" && (
                    <div className="p-4 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl text-xs space-y-3">
                      <div className="flex items-start space-x-2">
                        <span className="text-base">⏱️</span>
                        <div>
                          <p className="font-bold">GPS Acquisition Timed Out</p>
                          <p className="text-amber-800 mt-1">
                            No reading with accuracy ≤{ACCEPTABLE_GPS_METERS}m was obtained within{" "}
                            {MAX_ACQUISITION_MS / 1000} seconds.
                          </p>
                          {locationState.bestReading && (
                            <p className="font-mono text-amber-700 mt-1">
                              Best reading obtained: ±{locationState.bestReading.accuracyMeters}m
                              (exceeds ±{ACCEPTABLE_GPS_METERS}m threshold)
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="bg-amber-100 rounded-lg p-2.5 text-[10px] text-amber-800 space-y-0.5">
                        <div className="font-bold text-amber-900">
                          ⚠ No coordinates were stored. The coarse reading is NOT used as your location.
                        </div>
                        {locationState.bestReading && (
                          <div className="font-mono mt-1">
                            Raw best reading: {locationState.bestReading.latitude.toFixed(6)},{" "}
                            {locationState.bestReading.longitude.toFixed(6)} — NOT stored
                          </div>
                        )}
                      </div>

                      <p className="text-amber-800 text-[11px]">
                        On a Windows desktop/laptop without GPS hardware, the browser uses
                        network/IP positioning which rarely achieves &lt;100m accuracy. For precise
                        GPS reporting, use an Android or iPhone outdoors with location services
                        enabled.
                      </p>

                      <div className="flex flex-wrap gap-2 pt-1 border-t border-amber-200">
                        <button
                          type="button"
                          onClick={handleRequestLiveLocation}
                          className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded-lg font-bold text-xs transition-colors"
                        >
                          Try Again
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLocationState({ status: "IDLE" });
                            setAddressText("");
                          }}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold text-xs transition-colors"
                        >
                          Use Map Pin Instead →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* PERMISSION_DENIED */}
                  {locationState.status === "PERMISSION_DENIED" && (
                    <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs space-y-3">
                      <div className="flex items-start space-x-2">
                        <span className="text-base">🚫</span>
                        <div>
                          <p className="font-bold text-red-900">Location Permission Denied</p>
                          <p className="text-red-700 mt-1">
                            The browser blocked location access. Your browser stored a &quot;denied&quot;
                            decision for this site — no permission popup will appear until you reset it.
                          </p>
                        </div>
                      </div>
                      <div className="bg-red-100 rounded-lg p-2.5 text-[10px] text-red-800 space-y-1">
                        <p className="font-bold">To reset permission in Chrome:</p>
                        <p>1. Click the lock/info icon in the browser address bar</p>
                        <p>2. Find &quot;Location&quot; → change to &quot;Ask&quot; or &quot;Allow&quot;</p>
                        <p>3. Reload this page and try again</p>
                        <p className="text-red-600 font-mono mt-1">
                          Or: chrome://settings/content/location → find this site → remove
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-red-200">
                        <button
                          type="button"
                          onClick={handleRequestLiveLocation}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-xs transition-colors"
                        >
                          Try Again
                        </button>
                        <button
                          type="button"
                          onClick={() => setLocationState({ status: "IDLE" })}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold text-xs transition-colors"
                        >
                          Use Map Pin Instead →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* UNSUPPORTED */}
                  {locationState.status === "UNSUPPORTED" && (
                    <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs space-y-2">
                      <div className="flex items-start space-x-2">
                        <span className="text-base">🚫</span>
                        <div>
                          <p className="font-bold text-red-900">Geolocation Unavailable</p>
                          <p className="text-red-700 mt-1">{locationState.message}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLocationState({ status: "IDLE" })}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold text-xs transition-colors"
                      >
                        Use Map Pin Instead →
                      </button>
                    </div>
                  )}

                  {/* MANUAL_SELECTION confirmed */}
                  {locationState.status === "MANUAL_SELECTION" && (
                    <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs flex items-center justify-between">
                      <span className="font-bold">
                        🗺️ Manual Location Pin Set ({locationState.latitude.toFixed(5)},{" "}
                        {locationState.longitude.toFixed(5)})
                      </span>
                      <span className="bg-blue-200 text-blue-900 px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase">
                        MANUAL_MAP_SELECTION
                      </span>
                    </div>
                  )}

                  {/* Map */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Interactive Location Map{" "}
                      <span className="font-normal text-slate-500">
                        — click anywhere to place a manual pin
                        {isAcquiring ? " (acquiring GPS, map will update when accepted)" : ""}
                      </span>
                    </label>
                    <LocationPickerMap
                      latitude={acceptedLat}
                      longitude={acceptedLng}
                      accuracyMeters={acceptedAccuracy}
                      locationSource={locationSource || undefined}
                      onManualLocationSelected={handleManualLocationSelected}
                      disabled={isAcquiring}
                    />
                  </div>

                  {/* Development Diagnostics */}
                  <details className="group">
                    <summary className="cursor-pointer text-[10px] text-slate-400 hover:text-slate-600 font-mono select-none">
                      🧪 Development Location Diagnostics (click to expand)
                    </summary>
                    <div className="mt-2 p-3.5 bg-slate-900 text-slate-200 rounded-2xl font-mono text-[10px] space-y-2 shadow-inner border border-slate-800">
                      <div className="grid sm:grid-cols-2 gap-2">
                        <div>
                          Status:{" "}
                          <strong
                            className={
                              locationState.status === "PRECISE_LOCATION_FOUND"
                                ? "text-emerald-400"
                                : locationState.status === "ACQUIRING_GPS"
                                ? "text-blue-400"
                                : locationState.status === "TIMEOUT"
                                ? "text-amber-400"
                                : locationState.status === "PERMISSION_DENIED" ||
                                  locationState.status === "UNSUPPORTED"
                                ? "text-red-400"
                                : "text-slate-400"
                            }
                          >
                            {locationState.status.toUpperCase().replace("_", " ")}
                          </strong>
                        </div>
                        <div>
                          Secure context:{" "}
                          <strong
                            className={
                              secureContextInfo?.isSecure ? "text-emerald-400" : "text-red-400"
                            }
                          >
                            {secureContextInfo?.isSecure ? "YES" : "NO"}
                          </strong>
                        </div>
                        <div>
                          Acquisition method:{" "}
                          <strong className="text-white">watchPosition()</strong>
                        </div>
                        <div>
                          enableHighAccuracy:{" "}
                          <strong className="text-emerald-400">true</strong>
                        </div>
                        <div>
                          maximumAge:{" "}
                          <strong className="text-emerald-400">0 (no cache)</strong>
                        </div>
                        <div>
                          Precision target:{" "}
                          <strong className="text-slate-300">≤{PRECISION_TARGET_METERS}m</strong>
                        </div>
                        <div>
                          Acceptable target:{" "}
                          <strong className="text-slate-300">≤{ACCEPTABLE_GPS_METERS}m</strong>
                        </div>
                        <div>
                          Max acquisition:{" "}
                          <strong className="text-slate-300">{MAX_ACQUISITION_MS / 1000}s</strong>
                        </div>
                        {locationState.status === "ACQUIRING_GPS" && locationState.bestReading && (
                          <>
                            <div>
                              Latest reading:{" "}
                              <strong className="text-blue-300">
                                ±{locationState.latestReading?.accuracyMeters}m
                              </strong>
                            </div>
                            <div>
                              Best reading:{" "}
                              <strong className="text-emerald-300">
                                ±{locationState.bestReading.accuracyMeters}m
                              </strong>
                            </div>
                          </>
                        )}
                        {locationState.status === "PRECISE_LOCATION_FOUND" && (
                          <>
                            <div>
                              Accepted lat:{" "}
                              <strong className="text-emerald-300">
                                {locationState.result.latitude}
                              </strong>
                            </div>
                            <div>
                              Accepted lng:{" "}
                              <strong className="text-emerald-300">
                                {locationState.result.longitude}
                              </strong>
                            </div>
                            <div>
                              Accepted accuracy:{" "}
                              <strong className="text-emerald-300">
                                ±{locationState.result.accuracyMeters}m
                              </strong>
                            </div>
                            <div>
                              Permission:{" "}
                              <strong className="text-white">
                                {locationState.result.permissionState}
                              </strong>
                            </div>
                          </>
                        )}
                        <div className="sm:col-span-2">
                          Stored location:{" "}
                          <strong className="text-blue-300">
                            {acceptedLat !== null && acceptedLng !== null
                              ? `${acceptedLat}, ${acceptedLng} [${locationSource}]`
                              : "NONE — no coordinates stored"}
                          </strong>
                        </div>
                      </div>

                      {locationState.status === "PRECISE_LOCATION_FOUND" && (
                        <details className="text-[9px] text-slate-400 border-t border-slate-800 pt-1.5 cursor-pointer">
                          <summary className="hover:text-slate-200">
                            Raw GeolocationCoordinates object
                          </summary>
                          <pre className="mt-1 p-2 bg-slate-950 rounded text-slate-300 overflow-x-auto">
                            {JSON.stringify(locationState.result.rawCoords, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </details>

                  {/* Address & Ward inputs */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Street Address / Landmark
                        {geocoding && (
                          <span className="ml-2 text-[10px] text-slate-400 font-normal animate-pulse">
                            Reverse geocoding...
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={addressText}
                        onChange={(e) => setAddressText(e.target.value)}
                        placeholder="e.g. 123 Station Road, Ward 1"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        required
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">
                          Municipal Ward / Zone
                        </label>
                        {wardId && (
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                            Derived from Location
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={wardId}
                        onChange={(e) => setWardId(e.target.value)}
                        placeholder="e.g. Bagalkot Municipal Zone, Ilkal Ward 4"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                      />
                    </div>

                    {/* Read-only coordinate display — only shows when confirmed */}
                    {acceptedLat !== null && acceptedLng !== null && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Latitude
                          </label>
                          <input
                            type="text"
                            value={acceptedLat.toString()}
                            readOnly
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-mono outline-none cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Longitude
                          </label>
                          <input
                            type="text"
                            value={acceptedLng.toString()}
                            readOnly
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-mono outline-none cursor-not-allowed"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Nearby Duplicate Warning */}
                {showDuplicateWarning && nearbyDuplicates.length > 0 && (
                  <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl space-y-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-xl">⚠️</span>
                      <h4 className="text-sm font-bold text-amber-900">
                        Similar Civic Issue Reported Nearby
                      </h4>
                    </div>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      A report titled{" "}
                      <strong className="text-amber-950">
                        &quot;{nearbyDuplicates[0].canonicalTitle}&quot;
                      </strong>{" "}
                      was submitted nearby ({nearbyDuplicates[0].addressText || "recorded location"}).
                      Review existing reports to prevent duplicate municipal dispatch.
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowDuplicateWarning(false)}
                        className="px-3.5 py-1.5 bg-amber-700 text-white font-bold text-xs rounded-xl hover:bg-amber-800 transition-colors shadow-sm"
                      >
                        Submit New Report Anyway →
                      </button>
                      <a
                        href={`/issues/${nearbyDuplicates[0].id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-1.5 bg-white border border-amber-300 text-amber-900 font-bold text-xs rounded-xl hover:bg-amber-100 transition-colors inline-block"
                      >
                        View Existing Report ↗
                      </a>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t">
                  <button
                    type="submit"
                    className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-md text-base"
                  >
                    Submit Report &amp; Run Multimodal AI Triage
                  </button>
                </div>
              </form>
            )}

            {step === "ANALYZING" && (
              <div className="py-16 text-center space-y-6">
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-slate-900">
                    Running Multimodal Gemini 2.5 Flash AI Triage...
                  </h2>
                  <p className="text-slate-600 text-sm max-w-md mx-auto">
                    Evaluating evidence photo and report text, assessing hazard level, classifying
                    jurisdiction, and invoking save_ai_triage_assessment RPC.
                  </p>
                </div>
              </div>
            )}

            {step === "SUCCESS" && analysisResult && (
              <div className="space-y-6 text-center py-6">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                  ✓
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-slate-900">
                    Report Successfully Filed &amp; Triaged
                  </h2>
                  <p className="text-slate-600 text-sm">
                    Tracking ID:{" "}
                    <span className="font-mono font-bold text-slate-800">{createdId}</span>
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-left space-y-4 max-w-lg mx-auto shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                      Multimodal AI Triage Assessment
                    </h3>
                    <span className="text-xs font-bold px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full">
                      Confidence: {Math.round((analysisResult.confidenceScore ?? 1) * 100)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs font-semibold">
                    <div className="p-2.5 bg-white border rounded-xl">
                      <span className="text-slate-400 block text-[10px] uppercase">Civic Status</span>
                      <span
                        className={
                          analysisResult.isCivicIssue
                            ? "text-emerald-700 font-bold"
                            : "text-amber-700 font-bold"
                        }
                      >
                        {analysisResult.isCivicIssue ? "✓ Valid Civic Issue" : "⚠️ Non-Civic Issue"}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white border rounded-xl">
                      <span className="text-slate-400 block text-[10px] uppercase">Jurisdiction</span>
                      <span
                        className={
                          analysisResult.inJurisdiction
                            ? "text-emerald-700 font-bold"
                            : "text-amber-700 font-bold"
                        }
                      >
                        {analysisResult.inJurisdiction ? "✓ Municipal Zone" : "⚠️ Outside Zone"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm pt-1">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Priority Level:</span>
                      <span className="font-bold text-slate-900">
                        {analysisResult.priorityLevel} ({analysisResult.priorityScore}/100)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Hazard Category:</span>
                      <span className="font-bold text-red-700">
                        {analysisResult.hazardClassification || "Standard Hazard"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Assigned Department:</span>
                      <span className="font-bold text-blue-700">
                        {analysisResult.recommendedDepartment}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Ward:</span>
                      <span className="font-bold text-slate-900">{wardId}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 text-xs text-slate-600 space-y-1.5">
                    <p>
                      <span className="font-bold text-slate-800">AI Reasoning:</span>{" "}
                      {analysisResult.reasoning}
                    </p>
                    <p>
                      <span className="font-bold text-slate-800">Work Instructions:</span>{" "}
                      {analysisResult.workSummary}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
                  <button
                    onClick={() => router.push(`/issues/${createdId}`)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-sm text-sm"
                  >
                    View Issue Details &amp; Timeline
                  </button>
                  <button
                    onClick={() => router.push("/my-reports")}
                    className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors text-sm"
                  >
                    View My Reports
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </RouteGuard>
  );
}
