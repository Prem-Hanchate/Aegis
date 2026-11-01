export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  timestamp?: Date;
  sessionCreatedAt?: Date | string | null;
  deviceLastSeenAt?: Date | string | null;
  sessionId?: string | null;
}

export interface ContextEvaluationResult {
  decision: "ALLOW" | "DENY" | "REVIEW_REQUIRED";
  passed: boolean;
  reasons: string[];
  evaluatedRules: Array<{
    rule: string;
    passed: boolean;
    decision: "ALLOW" | "DENY" | "REVIEW_REQUIRED";
    reason?: string;
  }>;
}

export interface ContextRulesConfig {
  maxSessionAgeMs: number; // Default: 15 minutes
  maxDeviceInactivityMs: number; // Default: 24 hours
  rateLimitWindowMs: number; // Default: 5000ms (5 seconds)
  maxRequestsPerWindow: number; // Default: 30 requests
  blockedIps: Set<string>;
  requireActiveHeartbeat: boolean;
}

export const defaultContextConfig: ContextRulesConfig = {
  maxSessionAgeMs: 15 * 60 * 1000, // 15 mins
  maxDeviceInactivityMs: 24 * 60 * 60 * 1000, // 24 hours
  rateLimitWindowMs: 5000,
  maxRequestsPerWindow: 30,
  blockedIps: new Set<string>(["198.51.100.1", "203.0.113.99"]), // example threat intel IPs
  requireActiveHeartbeat: false, // optional strict mode
};

let currentConfig: ContextRulesConfig = { ...defaultContextConfig };

// Sliding window request tracking for unusual pattern detection: sessionId/ip -> timestamps[]
const requestTimestamps = new Map<string, number[]>();

export function configureContextRules(custom: Partial<ContextRulesConfig>) {
  currentConfig = {
    ...currentConfig,
    ...custom,
    blockedIps: custom.blockedIps ? new Set(custom.blockedIps) : currentConfig.blockedIps,
  };
}

export function resetContextRules() {
  currentConfig = { ...defaultContextConfig };
  requestTimestamps.clear();
}

/**
 * Tracks request timestamp and detects unusual rapid request patterns.
 */
function recordAndCheckRequestPattern(key: string, now: number, windowMs: number, maxRequests: number): boolean {
  let timestamps = requestTimestamps.get(key);
  if (!timestamps) {
    timestamps = [];
    requestTimestamps.set(key, timestamps);
  }

  // Filter out older timestamps outside the window
  const cutoff = now - windowMs;
  timestamps = timestamps.filter((t) => t > cutoff);
  timestamps.push(now);
  requestTimestamps.set(key, timestamps);

  return timestamps.length <= maxRequests;
}

/**
 * Evaluates contextual request attributes against Zero Trust rules.
 */
export function evaluateContextRules(context: RequestContext, config = currentConfig): ContextEvaluationResult {
  const now = (context.timestamp ?? new Date()).getTime();
  const reasons: string[] = [];
  const evaluatedRules: ContextEvaluationResult["evaluatedRules"] = [];
  let finalDecision: "ALLOW" | "DENY" | "REVIEW_REQUIRED" = "ALLOW";

  // Rule 1: IP Address Denylist / Network Context
  const clientIp = context.ipAddress?.trim() || "";
  if (clientIp && config.blockedIps.has(clientIp)) {
    evaluatedRules.push({
      rule: "IP_REPUTATION",
      passed: false,
      decision: "DENY",
      reason: `Client IP ${clientIp} is present in the network security blocklist.`,
    });
    reasons.push(`Client IP ${clientIp} is blocked.`);
    finalDecision = "DENY";
  } else {
    evaluatedRules.push({
      rule: "IP_REPUTATION",
      passed: true,
      decision: "ALLOW",
    });
  }

  // Rule 2: Session Age Validation
  if (context.sessionCreatedAt) {
    const sessionCreatedTime = new Date(context.sessionCreatedAt).getTime();
    if (!isNaN(sessionCreatedTime)) {
      const age = now - sessionCreatedTime;
      if (age > config.maxSessionAgeMs) {
        evaluatedRules.push({
          rule: "SESSION_AGE",
          passed: false,
          decision: "DENY",
          reason: `Session age (${Math.round(age / 1000)}s) exceeds max allowed lifetime (${config.maxSessionAgeMs / 1000}s).`,
        });
        reasons.push("Session has exceeded maximum allowable Zero Trust duration.");
        finalDecision = "DENY";
      } else {
        evaluatedRules.push({
          rule: "SESSION_AGE",
          passed: true,
          decision: "ALLOW",
        });
      }
    }
  }

  // Rule 3: Device Activity & Heartbeat Recency
  if (context.deviceLastSeenAt) {
    const lastSeenTime = new Date(context.deviceLastSeenAt).getTime();
    if (!isNaN(lastSeenTime)) {
      const inactiveDuration = now - lastSeenTime;
      if (config.requireActiveHeartbeat && inactiveDuration > config.maxDeviceInactivityMs) {
        evaluatedRules.push({
          rule: "DEVICE_ACTIVITY",
          passed: false,
          decision: "DENY",
          reason: `Device has been inactive for ${Math.round(inactiveDuration / 3600000)} hours.`,
        });
        reasons.push("Device posture check failed due to stale hardware telemetry.");
        if (finalDecision !== "DENY") finalDecision = "DENY";
      } else {
        evaluatedRules.push({
          rule: "DEVICE_ACTIVITY",
          passed: true,
          decision: "ALLOW",
        });
      }
    }
  }

  // Rule 4: Unusual Request Pattern Detection
  const trackingKey = context.sessionId || clientIp || "unknown";
  if (trackingKey !== "unknown") {
    const patternPassed = recordAndCheckRequestPattern(
      trackingKey,
      now,
      config.rateLimitWindowMs,
      config.maxRequestsPerWindow
    );

    if (!patternPassed) {
      evaluatedRules.push({
        rule: "UNUSUAL_REQUEST_PATTERN",
        passed: false,
        decision: "REVIEW_REQUIRED",
        reason: `High request burst detected (${config.maxRequestsPerWindow}+ requests within ${config.rateLimitWindowMs / 1000}s).`,
      });
      reasons.push("Anomalous rapid request pattern flagged for administrative review.");
      if (finalDecision === "ALLOW") {
        finalDecision = "REVIEW_REQUIRED";
      }
    } else {
      evaluatedRules.push({
        rule: "UNUSUAL_REQUEST_PATTERN",
        passed: true,
        decision: "ALLOW",
      });
    }
  }

  return {
    decision: finalDecision,
    passed: finalDecision === "ALLOW" || finalDecision === "REVIEW_REQUIRED",
    reasons,
    evaluatedRules,
  };
}

