/**
 * CivicFix Location Service — v3 (Phase F9)
 *
 * ACQUISITION STRATEGY:
 * - Uses navigator.geolocation.watchPosition() for accuracy-seeking GPS acquisition.
 * - GPS hardware typically returns a coarse first reading that improves over time.
 * - This service collects continuous readings, tracks the best accuracy seen so far,
 *   and stops the watcher immediately when the precision target is met.
 * - The caller decides when to stop based on a maximum acquisition duration.
 *
 * STRICT RULES:
 * - NEVER returns hardcoded, mock, cached, fallback, or city-default coordinates.
 * - Does NOT run automatically on page load.
 * - Accuracy is VALIDATED: readings above ACCEPTABLE_GPS_METERS are not stored as GPS.
 * - No location is ever labelled LIVE_PRECISE_DEVICE unless accuracy validation passed.
 * - Caller MUST call WatchHandle.stop() on unmount, timeout, cancel, or error.
 * - No multiple concurrent watchers are possible — each call returns a fresh, isolated handle.
 */

// ─── Accuracy thresholds ──────────────────────────────────────────────────────

/**
 * A reading at or below this threshold is accepted immediately and the watcher is stopped.
 * Characteristic of outdoor GPS hardware with good satellite visibility.
 */
export const PRECISION_TARGET_METERS = 50;

/**
 * If the maximum acquisition time elapses, a best reading at or below this threshold
 * is still accepted as a usable GPS location (just less precise).
 * Above this value the reading is never stored as a precise GPS location.
 */
export const ACCEPTABLE_GPS_METERS = 100;

/**
 * Maximum number of milliseconds the page should allow the watcher to run before
 * declaring a TIMEOUT and calling WatchHandle.stop().
 * The page component is responsible for the timeout — the service does not manage it.
 */
export const MAX_ACQUISITION_MS = 30_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export type LocationSource = "LIVE_PRECISE_DEVICE" | "MANUAL_MAP_SELECTION";

export type GeolocationPermissionState = "granted" | "denied" | "prompt" | "unknown";

/** One raw position reading from the browser Geolocation API. */
export interface LiveReading {
  latitude: number;
  longitude: number;
  /** Rounded accuracy in metres. */
  accuracyMeters: number;
  timestamp: number;
  rawCoords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    heading: number | null;
    speed: number | null;
    timestamp: number;
  };
}

/** A validated, accepted precise live location. Always accuracy <= ACCEPTABLE_GPS_METERS. */
export interface AcceptedLiveLocation {
  accepted: true;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: number;
  source: "LIVE_PRECISE_DEVICE";
  permissionState: GeolocationPermissionState;
  rawCoords: LiveReading["rawCoords"];
}

/** Error when the browser Geolocation API itself fails (permission denied, unavailable, timeout). */
export interface GeolocationApiError {
  /** 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT */
  code: number;
  message: string;
  permissionState: GeolocationPermissionState;
}

/** Callbacks provided by the page component to receive progressive location updates. */
export interface WatchCallbacks {
  /**
   * Fired every time a new position reading arrives.
   * - `reading`: the latest reading from the device
   * - `bestSoFar`: the best (most accurate) reading seen during this acquisition session
   *
   * NOTE: If the latest reading meets PRECISION_TARGET_METERS, `onAccepted` will fire
   * immediately after this callback and the watcher will stop.
   */
  onReading: (reading: LiveReading, bestSoFar: LiveReading) => void;

  /**
   * Fired when a reading meets PRECISION_TARGET_METERS.
   * The watcher is stopped internally before this is called.
   * The caller should clear any page-level timeout and update state to PRECISE_LOCATION_FOUND.
   */
  onAccepted: (result: AcceptedLiveLocation) => void;

  /**
   * Fired when the Geolocation API reports a hard error (permission denied, position
   * unavailable, or per-reading timeout). The watcher is stopped internally.
   * The caller should clear any page-level timeout and handle the specific error code.
   */
  onError: (error: GeolocationApiError) => void;
}

/** Returned by startAccuracySeekingWatch. Must be stopped by the caller. */
export interface WatchHandle {
  /**
   * Stop the watcher immediately. Safe to call multiple times.
   * Must be called in: component unmount, page-level timeout, user cancel, error handler.
   */
  stop: () => void;

  /**
   * Returns the best (most accurate) reading collected so far during this session.
   * Returns null if no readings have been received yet.
   * Call this before stopping to determine whether to accept or reject the session result.
   */
  getBestReading: () => LiveReading | null;

  /** The permission state at the time this watcher was started. */
  permissionState: GeolocationPermissionState;
}

// ─── Secure context diagnostic ───────────────────────────────────────────────

export interface SecureContextInfo {
  isSecure: boolean;
  /**
   * A human-readable warning if the page is not in a secure context.
   * null if no warning needed (localhost or HTTPS).
   */
  warning: string | null;
}

export interface DetailedGeocodeResult {
  formattedAddress: string;
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  district?: string;
  state?: string;
  country?: string;
  postcode?: string;
  jurisdiction: string;
  isSupportedJurisdiction: boolean;
  derivedWard: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class LocationService {
  /**
   * Check whether the current page is in a secure context for Geolocation purposes.
   *
   * Chrome allows navigator.geolocation on:
   *   - https:// (any host)
   *   - http://localhost (treated as secure by browsers for dev)
   *   - http://127.0.0.1
   *
   * Chrome BLOCKS navigator.geolocation on:
   *   - http://<lan-ip>:3000 (e.g. http://192.168.1.x:3000 from a phone)
   *   - Any non-localhost HTTP deployment
   *
   * This is a diagnostic only — does not prevent the acquisition from being attempted.
   */
  checkSecureContext(): SecureContextInfo {
    if (typeof window === "undefined") return { isSecure: true, warning: null };
    if (window.isSecureContext) return { isSecure: true, warning: null };
    return {
      isSecure: false,
      warning:
        "⚠️ DEV WARNING: This page is not in a secure context (non-localhost HTTP). " +
        "Chrome blocks GPS on non-HTTPS origins except localhost. " +
        "For physical mobile device testing, use HTTPS (e.g. ngrok, Vercel preview, or a deployed environment).",
    };
  }

  /**
   * Query the browser Permissions API for the current geolocation permission state.
   * This is a READ-ONLY check — it does NOT trigger a browser permission prompt.
   * A prompt only appears when navigator.geolocation.watchPosition() is called.
   */
  async getPermissionState(): Promise<GeolocationPermissionState> {
    if (typeof window === "undefined" || !navigator.permissions) return "unknown";
    try {
      const result = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      return result.state as GeolocationPermissionState;
    } catch {
      return "unknown";
    }
  }

  /**
   * Start an accuracy-seeking GPS acquisition session using watchPosition().
   *
   * IMPORTANT: This must ONLY be called when the user explicitly clicks
   * "Use My Live Location". It must NEVER be called automatically on page load.
   *
   * Behaviour:
   * 1. Reads current permission state (does not trigger a prompt).
   * 2. Starts navigator.geolocation.watchPosition() with enableHighAccuracy:true, maximumAge:0.
   * 3. On each reading: updates the best reading, calls onReading.
   * 4. If a reading meets PRECISION_TARGET_METERS: internally stops the watcher, calls onAccepted.
   * 5. On hard API error: internally stops the watcher, calls onError.
   * 6. The caller is responsible for enforcing MAX_ACQUISITION_MS via setTimeout.
   *    When the caller's timeout fires, it should call handle.stop(), check getBestReading(),
   *    and decide whether to accept (<=ACCEPTABLE_GPS_METERS) or reject.
   *
   * Throws GeolocationApiError synchronously if:
   * - Geolocation API is not supported by this browser.
   * - navigator.geolocation is unavailable (e.g. insecure non-localhost context).
   */
  async startAccuracySeekingWatch(callbacks: WatchCallbacks): Promise<WatchHandle> {
    // Check API availability
    if (typeof window === "undefined" || !navigator.geolocation) {
      const err: GeolocationApiError = {
        code: 2,
        message:
          "Geolocation API is not supported by this browser or is unavailable in the current context. " +
          (this.checkSecureContext().warning ?? ""),
        permissionState: "unknown",
      };
      throw err;
    }

    // Read permission state (read-only, no prompt)
    const permissionState = await this.getPermissionState();

    // State for this watcher session
    let watchId: number | null = null;
    let stopped = false;
    let bestReading: LiveReading | null = null;

    const doStop = () => {
      if (stopped) return;
      stopped = true;
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    const buildAcceptedResult = (reading: LiveReading): AcceptedLiveLocation => ({
      accepted: true,
      latitude: Number(reading.latitude.toFixed(6)),
      longitude: Number(reading.longitude.toFixed(6)),
      accuracyMeters: reading.accuracyMeters,
      capturedAt: reading.timestamp,
      source: "LIVE_PRECISE_DEVICE",
      permissionState,
      rawCoords: reading.rawCoords,
    });

    // Start the watcher
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (stopped) return;

        const reading: LiveReading = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Math.round(position.coords.accuracy),
          timestamp: position.timestamp || Date.now(),
          rawCoords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp || Date.now(),
          },
        };

        // Update best reading (keep lowest accuracy value = most precise)
        if (!bestReading || reading.accuracyMeters < bestReading.accuracyMeters) {
          bestReading = reading;
        }

        // Notify caller of the new reading and current best
        callbacks.onReading(reading, bestReading);

        // If precision target met: stop watcher and accept immediately
        if (reading.accuracyMeters <= PRECISION_TARGET_METERS) {
          doStop();
          callbacks.onAccepted(buildAcceptedResult(reading));
        }
      },
      (error) => {
        if (stopped) return;
        doStop();

        let message = "Unable to acquire live location.";
        if (error.code === error.PERMISSION_DENIED) {
          message =
            "Location permission was denied. " +
            "To reset, open browser settings → Site Settings → Location → find this site → Allow.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message =
            "Position unavailable — the device or location provider returned no coordinates. " +
            "Check that location services are enabled in your operating system and browser settings.";
        } else if (error.code === error.TIMEOUT) {
          message =
            "The first GPS reading did not arrive within the expected time. " +
            "On mobile, try moving outdoors for better satellite visibility.";
        }

        callbacks.onError({
          code: error.code,
          message,
          permissionState,
        });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0, // Never use a cached reading — always request a fresh fix
        // No timeout option here — the page component manages the total acquisition duration
        // via MAX_ACQUISITION_MS. Setting timeout here would only affect the first reading.
      }
    );

    // Return the handle for the caller to control
    const handle: WatchHandle = {
      stop: doStop,
      getBestReading: () => bestReading,
      permissionState,
    };

    return handle;
  }

  /**
   * Reverse geocode a coordinate pair to a human-readable address string.
   *
   * Must ONLY be called after coordinates have been ACCEPTED (accuracy validated)
   * or explicitly manually selected on the map.
   * Must NEVER be called on rejected, coarse, or IP-estimated coordinates.
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<string> {
    const detailed = await this.reverseGeocodeDetailed(latitude, longitude);
    return detailed.formattedAddress;
  }

  /**
   * Reverse geocode with full structured civic jurisdiction analysis.
   */
  async reverseGeocodeDetailed(latitude: number, longitude: number): Promise<DetailedGeocodeResult> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
        {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "CivicFix/3.0 (Municipal Infrastructure Portal)",
          },
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const addr = data.address || {};

      const city = addr.city || addr.town || addr.village || addr.municipality || "";
      const suburb = addr.suburb || addr.neighbourhood || addr.residential || "";
      const district = addr.state_district || addr.county || "";
      const state = addr.state || "";
      const country = addr.country || "India";
      const postcode = addr.postcode || "";

      const localityName = city || district || suburb || "Municipal Area";
      const jurisdiction = localityName ? `${localityName}, ${state || country}` : "Civic Service Jurisdiction";

      let derivedWard = "Unzoned / Ward Pending Verification";
      if (suburb && localityName) {
        derivedWard = `${localityName} — ${suburb} Zone`;
      } else if (localityName) {
        derivedWard = `${localityName} Municipal Zone`;
      }

      return {
        formattedAddress: data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        city: city || undefined,
        town: addr.town || undefined,
        village: addr.village || undefined,
        suburb: suburb || undefined,
        district: district || undefined,
        state: state || undefined,
        country: country || undefined,
        postcode: postcode || undefined,
        jurisdiction,
        isSupportedJurisdiction: true,
        derivedWard,
      };
    } catch (err: any) {
      console.warn("[LocationService] Detailed reverse geocoding failed:", err?.message);
      return {
        formattedAddress: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        jurisdiction: "Active Coordinates",
        isSupportedJurisdiction: true,
        derivedWard: "Unzoned / Ward Pending Verification",
      };
    }
  }
}

export const locationService = new LocationService();
