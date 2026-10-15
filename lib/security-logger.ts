/**
 * Structured Security Event Logger
 * Records security-relevant occurrences (unauthorized access, rate limits, resource mutations)
 * without logging secrets, tokens, passwords, or private message content.
 */

export type SecurityEventType =
  | "AUTH_FAILURE"
  | "UNAUTHORIZED_ACCESS_ATTEMPT"
  | "RATE_LIMIT_TRIGGERED"
  | "INVALID_PAYLOAD"
  | "PROJECT_DELETED"
  | "PROJECT_MODIFIED";

export function logSecurityEvent(
  eventType: SecurityEventType,
  details: {
    userId?: string;
    targetId?: string;
    endpoint?: string;
    ip?: string;
    reason?: string;
  }
) {
  const payload = {
    level: "SECURITY_AUDIT",
    timestamp: new Date().toISOString(),
    eventType,
    ...details,
  };

  // Structured output for security monitoring/aggregation
  console.warn(`[SECURITY] ${JSON.stringify(payload)}`);
}
