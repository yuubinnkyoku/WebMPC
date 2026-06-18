import type { Bank } from "../types/models";

export const BANKS: Bank[] = ["A", "B", "C", "D"];

export function formatBankAriaLabel(bank: Bank): string {
  return `Show bank ${bank}`;
}
