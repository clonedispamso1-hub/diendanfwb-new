export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  public_id?: string | null;
  avatar: string | null;
  bio: string | null;
  location: string | null;
  province: string | null;
  gem_balance: number | null;
  followers_count: number | null;
  role: string | null;
  is_admin: boolean | null;
  badge_id?: string | null;
  is_virtual?: boolean | null;
  is_online: boolean | null;
  last_seen?: string | null;
  is_banned: boolean | null;
  cover_url?: string | null;
  banned_until: string | null;
  name_changes: number | null;
  last_name_change: string | null;
  last_ip: string | null;
  created_at: string | null;
  vip_level: number | null;
  vip_exp?: number | null;
  last_checkin_at?: string | null;
  last_online_exp_at?: string | null;
  trust_score?: number | null;
  reputation_score?: number | null;
  status?: string | null;
  ban_reason?: string | null;
  password?: string | null;
  photos?: string[] | null;
  title_gif_url?: string | null;
  // Profile upgrade — Hybrid FB + Dating UX
  height?: number | null;
  weight?: number | null;
  intent?: "fwb" | "ons" | "love" | "dating" | "serious" | string | null;
  intent_locked_until?: string | null;
  location_last_changed_at?: string | null;
  location_change_count?: number | null;
  gender?: "male" | "female" | string | null;
  phone?: string | null;
  age?: number | null;
  interests?: string[] | null;
  is_fwb_active?: boolean | null;
  is_seed_account?: boolean | null;
  location_ready?: boolean | null;
  account_status?: "active" | "suspended" | string | null;
  // Premium onboarding flow
  is_onboarding_completed?: boolean | null;
  nickname?: string | null;
  birthday?: string | null;
  zodiac?: string | null;
  relationship_status?: string | null;
  personality_tags?: string[] | null;
  communication_styles?: string[] | null;
  goal?: string | null;
  target_gender?: string | null;
  preferred_language?: string | null;
  facebook?: string | null;
  zalo?: string | null;
}

export interface PostRecord {
  id: string;
  user_id: string;
  content: string | null;
  image_url?: string | null;
  image?: string | null;
  image_urls?: string[] | null;
  visibility?: "home" | "profile" | string | null;
  status?: "published" | "pending" | "rejected" | string | null;
  has_images?: boolean | null;
  category?: "general" | "important" | "ons" | "fwb" | "dating" | "private" | "feedback" | string | null;
  is_anonymous?: boolean | null;
  display_view_offset?: number | null;
  created_at: string | null;
  facebook_url?: string | null;
  zalo_url?: string | null;
  profiles?: Profile | null;
}

export interface MessageRecord {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string | null;
  image_url?: string | null;
  image?: string | null;
  is_read: boolean | null;
  created_at: string | null;
  reply_to?: string | null;
  edited_at?: string | null;
  is_recalled?: boolean | null;
  recalled_at?: string | null;
}
