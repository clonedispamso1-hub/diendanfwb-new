interface GenderIconProps {
  gender?: string | null;
  withLabel?: boolean;
}

/**
 * Gender display removed from member cards by product decision.
 * Kept as a no-op component so existing call sites continue to compile.
 */
export function GenderIcon(_props: GenderIconProps) {
  return null;
}
