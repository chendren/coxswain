export type ConsolePack = "default" | "local";

export interface ApiEnvelope<T> {
  ok: boolean;
  path: string[];
  data?: T;
  error?: string;
  at: string;
}
