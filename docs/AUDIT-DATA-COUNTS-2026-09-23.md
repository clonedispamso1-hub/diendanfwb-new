# AUDIT SỐ LIỆU THỰC TẾ — Supabase 1/2/3/4 · READ-ONLY (2026-09-23)

Phương pháp: chỉ gọi COUNT (HTTP GET, `Prefer: count=exact`) qua **publishable/anon key** đã có trong code.
KHÔNG DELETE / TRUNCATE / UPDATE / DROP / ALTER / migration / sửa RLS-Auth-Storage.

> ⚠️ GIỚI HẠN QUAN TRỌNG: anon key bị RLS lọc. Số `0` ở bảng có RLS chặt (admin, ví, log) là
> "anon không đọc được", KHÔNG chắc là bảng rỗng. Số liệu tuyệt đối 100% cần service-role key
> đặt làm secret server-side (không đưa vào chat/frontend).

## === SUPABASE 1 === (gxfxqbhxoghdhokwjpex — core)

| Table | Count (anon) | Nhóm |
|---|---|---|
| profiles | 256 | USER |
| post_gifts | 36 | FINANCIAL |
| vip_icons | 121 | SYSTEM |
| vip_icon_folders | 10 | SYSTEM |
| gif_library | 21 | SYSTEM |
| admin_site_settings | 19 | SYSTEM |
| nicktuongtac | 12 | USER |
| blocked_devices | 11 | SYSTEM |
| blocked_ips | 11 | SYSTEM |
| feedback_posts | 5 | USER |
| admin_popups | 1 | ADMIN |
| device_approval_settings | 1 | SYSTEM |
| bangchu | 0 * | ADMIN |
| user_roles | 0 * | ADMIN |
| admin_permissions / admin_role_assignments / admin_config | 0 * | ADMIN |
| admin_gift_batch_log | 0 * | LOG |
| gem_transactions / coin_transactions / transfer_transactions | 0 * | FINANCIAL |
| withdrawal_requests / withdrawal_audit_log | 0 * | FINANCIAL |
| seed_accounts / v_seed_accounts / fake_profiles / fake_follows | 0 * | USER |
| bot_accounts / bot_roles / bot_assignments / bot_settings | 0 * | SYSTEM |
| blocked_keywords / banned_keywords / blocked_phones / blocked_cookies / phone_blacklist | 0 * | SYSTEM |
| phone_verifications / profile_verifications | 0 * | USER |
| user_blocks / user_restrictions / forced_logouts | 0 * | USER |
| red_packets / stories / videos_social / fwb_profiles / device_accounts | 0 * | USER |
| crm_customers / crm_expenses | 0 * | ADMIN |
| internal_account_credentials | KHÔNG ĐỌC ĐƯỢC (42501 no grant) | ADMIN |

\* = anon bị RLS chặn hoặc bảng rỗng — chưa phân biệt được.

- `auth.users` tổng số: **KHÔNG ĐỌC ĐƯỢC** (cần service-role / Admin API).
- Số Admin/Bang Chủ: **CHƯA XÁC MINH** — `bangchu` và `user_roles` trả 0 do RLS.
- Storage objects: `GET /storage/v1/bucket` trả `[]` với anon → không xác minh được.

## === SUPABASE 2 === (pymwwuscoftmdcmmeckp — media)

| Table | Count |
|---|---|
| user_zalo | 173 |
| site_settings2 | 149 |
| voice_library | 5 |
| community_page | 1 |
| live_moc_rooms | 1 |
| live_moc_settings | 1 |
| call_sessions2 | 0 * |
| video_posts | 0 * |

Storage: không liệt kê được bằng anon (buckets `clone_media`, `voice-messages` được khai báo trong code).

## === SUPABASE 3 === (uaqsetfdciyzxpuhulux — social/logs)

| Table | Count | Nhóm |
|---|---|---|
| post_views | 7177 | LOG |
| member_activity_log | 1219 | LOG |
| activity_logs | 1040 | LOG |
| likes | 759 | USER |
| chat_partners | 491 | USER |
| comments | 348 | USER |
| posts | 291 | USER |
| follows | 244 | USER |
| conversation_clears | 47 | USER |
| comment_likes | 11 | USER |
| messages | 11 | USER |
| notifications | 11 | USER |
| leaderboard_weights | 7 | SYSTEM |
| weekly_scores | 2 | LOG |
| group_messages | 1 | USER |
| leaderboard_refresh_state | 1 | SYSTEM |
| conversations | 0 * | USER |
| message_gifts / message_reactions / virtual_chat_messages / chat_group_messages | 0 * | USER |
| admin_logs / audit_logs / security_events / candy_logs / dice_logs / keyword_logs / spam_detection_logs / system_health_logs / bot_actions_logs / agent_activity_logs / group_stats_log / group_leave_log | 0 * | LOG |
| moderation_queue / moderation_admins / admin_comment_jobs / admin_job_locks | 0 * | ADMIN |
| engagement_campaigns / engagement_events / engagement_points_log / profile_views / profile_views_today / rate_limit_hits / risk_scores / user_restrictions | 0 * | LOG/SYSTEM |

## === SUPABASE 4 === (ybzdpxwbpbkeqkqwbscp — bait/zalo/reports)

| Table | Count | Nhóm |
|---|---|---|
| map_coordinates | 24 | SYSTEM |
| reports | 18 | USER |
| bait_groups | 16 | ADMIN |
| seeding_follow_logs | 14 | LOG |
| nearby_settings | 12 | SYSTEM |
| zalo_sub_items_l1 | 11 | SYSTEM |
| seed_account_groups | 10 | ADMIN |
| albums | 4 | USER |
| zalo_user_areas | 4 | USER |
| zalo_country_cards | 3 | SYSTEM |
| bait_group_folders | 2 | ADMIN |
| zalo_media_library | 2 | SYSTEM |
| site_branding | 1 | SYSTEM |
| zalo_bait_groups | 1 | ADMIN |
| zalo_float_icon | 1 | SYSTEM |
| zalo_sub_items_l2 | 1 | SYSTEM |
| zalo_area_groups | 0 * | SYSTEM |
| nearby_pool | KHÔNG ĐỌC ĐƯỢC (42501 no grant) | USER |

## Đang thiếu quyền gì để có số liệu 100%

1. `SUPABASE1..4_SERVICE_ROLE_KEY` chưa tồn tại trong môi trường → không đọc được
   `auth.users`, `storage.objects`, và các bảng bị RLS chặn.
2. Không có kết nối database trực tiếp (không có `PGHOST`) tới 4 project này.

Phương án an toàn tiếp theo (chỉ SELECT): thêm 4 service-role key làm **secret server-side**
(qua hộp thoại thêm secret, không gửi vào chat), rồi chạy một server function READ-ONLY
đếm `information_schema.tables` + `count(*)` + `auth.users` + `storage.objects`.
