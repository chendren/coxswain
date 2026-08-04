/** Closed-set interaction channel ids. */
export type CxChannelId =
  | "chat"
  | "email"
  | "phone"
  | "phone_transcript"
  | "social_media"
  | "in_app"
  | "sms";

export const CX_CHANNEL_IDS: readonly CxChannelId[] = [
  "chat",
  "email",
  "phone",
  "phone_transcript",
  "social_media",
  "in_app",
  "sms",
] as const;

/** Closed-set sentiment labels used by classify / traffic / NBA context. */
export type CxSentimentId =
  | "angry"
  | "frustrated"
  | "confused"
  | "neutral"
  | "satisfied"
  | "demanding";

export const CX_SENTIMENT_IDS: readonly CxSentimentId[] = [
  "angry",
  "frustrated",
  "confused",
  "neutral",
  "satisfied",
  "demanding",
] as const;

/** Closed-set urgency labels. */
export type CxUrgencyId = "critical" | "high" | "medium" | "low";

export const CX_URGENCY_IDS: readonly CxUrgencyId[] = [
  "critical",
  "high",
  "medium",
  "low",
] as const;

/** Closed-set NBA action types. */
export type CxActionTypeId =
  | "escalation"
  | "routing"
  | "protocol"
  | "deflection"
  | "retention"
  | "proactive"
  | "recovery"
  | "sales"
  | "onboarding"
  | "engagement";

export const CX_ACTION_TYPE_IDS: readonly CxActionTypeId[] = [
  "escalation",
  "routing",
  "protocol",
  "deflection",
  "retention",
  "proactive",
  "recovery",
  "sales",
  "onboarding",
  "engagement",
] as const;

/** Condition operators for executable NBA rules (no free-text predicates). */
export type CxRuleOp = "eq" | "neq" | "in" | "not_in" | "gt" | "gte" | "lt" | "lte";

export const CX_RULE_OPS: readonly CxRuleOp[] = [
  "eq",
  "neq",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
] as const;

export type CxRuleLogic = "AND" | "OR";

export type CxKpiUnit = "count" | "percent" | "seconds" | "currency" | "score" | "ratio";
