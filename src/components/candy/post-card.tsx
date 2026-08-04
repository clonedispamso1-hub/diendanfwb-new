/**
 * The legacy 1235-line `post-card.tsx` has been split into a
 * modular system under `./post/`. This file preserves the
 * public import path used across the app:
 *
 *   import { PostCard } from "@/components/candy/post-card";
 *
 * Any new work should import from `@/components/candy/post` directly.
 */
export { PostCard, type PostCardProps } from "./post";
