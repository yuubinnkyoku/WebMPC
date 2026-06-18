const FORM_TARGET_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA", "BUTTON"]);

type KeyboardTargetLike = {
  tagName?: unknown;
  isContentEditable?: unknown;
};

export function shouldIgnorePadKeyboardEventTarget(target: EventTarget | KeyboardTargetLike | null): boolean {
  if (!target || typeof target !== "object") return false;
  const tagName = "tagName" in target && typeof target.tagName === "string" ? target.tagName.toUpperCase() : undefined;
  return (tagName !== undefined && FORM_TARGET_TAGS.has(tagName)) || ("isContentEditable" in target && target.isContentEditable === true);
}
