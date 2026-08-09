export type PackId = "default" | "retail" | "telco" | "financial" | "healthcare" | "travel";

export interface PackScore {
  packId: PackId;
  score: number; // 0-1
  matchedKeywords: string[];
}

const PACK_KEYWORDS: Record<PackId, string[]> = {
  default: [],
  retail: [
    "retail",
    "store",
    "ecommerce",
    "e-commerce",
    "returns",
    "refund",
    "loyalty",
    "pickup",
    "order",
    "cart",
    "checkout",
    "merchandise",
    "inventory",
    "omnichannel",
    "POS",
    "promotion",
    "coupon",
    "retention",
    "customer",
  ],
  telco: [
    "telco",
    "telecom",
    "telecommunications",
    "mobile",
    "wireless",
    "broadband",
    "fiber",
    "5g",
    "carrier",
    "mvno",
    "isp",
    "connectivity",
    "outage",
    "sim ",
    "handset",
    "roaming",
    "prepaid",
    "postpaid",
    "wireline",
    "cable",
  ],
  financial: [
    "financial",
    "bank",
    "banking",
    "account",
    "loan",
    "fraud",
    "onboarding",
    "KYC",
    "payment",
    "card",
    "mortgage",
    "wealth",
    "insurance",
  ],
  healthcare: [
    "healthcare",
    "health",
    "appointment",
    "claims",
    "prior_auth",
    "benefits",
    "patient",
    "provider",
    "medical",
    "HIPAA",
  ],
  travel: [
    "travel",
    "booking",
    "itinerary",
    "disruption",
    "hotel",
    "flight",
    "loyalty",
    "reservation",
    "check-in",
  ],
};

export function scorePack(text: string, packId: PackId): PackScore {
  const t = text.toLowerCase();
  const keys = PACK_KEYWORDS[packId] ?? [];
  if (packId === "default") return { packId, score: 0.1, matchedKeywords: [] };
  const matched = keys.filter((k) => t.includes(k.toLowerCase()));
  const score = keys.length === 0 ? 0 : matched.length / Math.min(5, keys.length);
  // clamp 0-1, boost if 2+ matches
  const boosted = matched.length >= 2 ? Math.min(1, score * 1.5) : score;
  return { packId, score: Math.min(1, boosted), matchedKeywords: matched };
}

export function detectPack(text: string): PackId {
  const scores = (Object.keys(PACK_KEYWORDS) as PackId[])
    .filter((p) => p !== "default")
    .map((p) => scorePack(text, p))
    .sort((a, b) => b.score - a.score);
  const top = scores[0];
  if (!top || top.score < 0.3) return "default";
  return top.packId;
}

export function listPacks(): PackId[] {
  return Object.keys(PACK_KEYWORDS) as PackId[];
}

// Legacy compat: keep isTelcoIdea for existing callers
export function isTelcoIdea(text: string): boolean {
  return detectPack(text) === "telco";
}
