# THIẾT KẾ KIẾN TRÚC BACKUP & RECOVERY — "ĐƯỜNG LUI" (SB1–SB4 + R2)

> Trạng thái: **CHỈ THIẾT KẾ**. Không chạy SQL, không sửa DB, không sửa cron, không xóa/restore dữ liệu.
> Ngày: 2026-09-22.

## 0. Hiện trạng đã xác nhận trong code (cơ sở của thiết kế)

| Thành phần | Nguồn trong repo | Ghi chú |
|---|---|---|
| SB1 (core) | `src/lib/db/config.ts` → `PRIMARY` `gxfxqbhxoghdhokwjpex` | auth, profiles, wallets/transactions/withdrawals, reports, user_roles, device/security, seed_accounts |
| SB2 (media/VIP) | `config.ts` → `MEDIA` `pymwwuscoftmdcmmeckp` | media, VIP, voice library, storage bucket |
| SB3 (social/logs) | `config.ts` → `LOGS` `uaqsetfdciyzxpuhulux` | posts, comments, likes, messages, notifications, activity/logs (đã cutover) |
| SB4 | `src/lib/supabase-v4.ts` → `ybzdpxwbpbkeqkqwbscp` | reports (bản SB4), albums, Zalo (areas/sub-items/country cards), bait groups, nearby, RPS, seeding |
| Định tuyến bảng | `src/services/database/config.ts` (`TABLE_ROUTES`) | nguồn chân lý để lập danh mục bảng cho từng snapshot |
| Sync SB1→SB3 | `src/routes/api/public/sync-content-to-s3.ts`, cờ `CONTENT_SYNC_ENABLED` | hiện mặc định TẮT; `src/lib/content-sync.ts` là no-op |
| R2 | `.env.example` (`R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_PUBLIC_DOMAIN`, keys), `scripts/migrate-content-to-s3.mjs` | media đã/đang chuyển sang R2 |
| Điểm lệch nguồn | `follows: "primary"` trong `services/database/config.ts` nhưng feed/chat ở SB3 | snapshot phải ghi rõ nguồn thật của từng bảng, không suy đoán |

**Rủi ro nền tảng:** `reports` tồn tại ở CẢ SB1 và SB4 → mọi snapshot/restore phải gắn nhãn nguồn (`sb1.reports`, `sb4.reports`) và **không bao giờ merge**.

---

## 1. Bốn lớp snapshot

### 1.1 Daily Snapshot (giữ 14 ngày)
- Mục tiêu: mất dữ liệu tối đa 24h cho phần nóng.
- Phạm vi:
  - **SB1 critical**: profiles, user_roles, bangchu, wallets, transactions, withdrawals, subscriptions, referrals, inventory, pets, user_restrictions, device_approvals/blocked_*, seed_accounts, `sb1.reports`.
  - **SB3**: posts, comments, likes/post_likes/comment_likes, messages + group_messages + message_reactions/gifts, chat_partners, follows-nếu-đã-ở-SB3, notifications.
  - **SB4**: `sb4.reports`, albums, zalo_* (areas, sub_items L1/L2, country_cards, float_icon), bait_groups, seed_account_groups, seeding_follow_logs.
- **Đồng bộ mốc thời gian:** một `snapshot_ts` (UTC) duy nhất cho cả job; mỗi DB chụp với điều kiện `updated_at/created_at <= snapshot_ts` và ghi `xact_watermark` (max id/updated_at thực tế đọc được) vào manifest. Snapshot chỉ `valid` khi **cả SB1, SB3, SB4 đều hoàn tất** trong cùng job; thiếu một DB → toàn job `partial`, **không đủ điều kiện restore**.
- Không có media bytes ở lớp này (chỉ manifest tham chiếu nếu rẻ).

### 1.2 Weekly Snapshot (giữ 8 tuần)
- SB1–SB4 **đầy đủ**: schema (DDL) + data + RPC/function/trigger + RLS/policy + grants + enum + index, trong phạm vi quyền cho phép.
- Kèm: config website, CRM (guide/regions/benefits/fee), VIP, seeding/bot config.
- **Media manifest** (không tải bytes): path/key, size, content-type, etag/hash, bucket, nguồn (R2 / Supabase Storage / Cloudinary).
- Dùng làm mốc "rebuild được cấu trúc từ 0".

### 1.3 Monthly Snapshot (giữ 12 tháng)
- **Full recovery package**: weekly-full + media mapping (DB row ↔ object key) + bytes media nếu có quyền.
- Bắt buộc `checksum`: hash từng file/từng bảng-dump + `manifest_hash` toàn gói → phát hiện file thiếu/đổi.
- Chốt bất biến: gói đã đóng thì read-only (object lock / prefix immutable nếu R2 hỗ trợ).

### 1.4 Pre-Change Snapshot (giữ 90 ngày)
- Bắt buộc trước mọi thao tác nguy hiểm: migration, purge member, drop/rename bảng, đổi `TABLE_ROUTES`, bulk update, đổi RLS, chạy file `RUN_NOW_*.sql`, bật/tắt sync.
- Gắn metadata: `operation_label`, `target_db[]`, `target_tables[]`, `actor_user_id`, `actor_role`, `ticket/lý do`, `planned_sql_hash`, `started_at`.
- Phạm vi: tối thiểu toàn bộ bảng bị tác động + bảng có FK trỏ tới chúng; nếu chạm ví/giao dịch → chụp cả nhóm tài chính SB1 như một khối.

---

## 2. Cấu trúc dữ liệu đề xuất

Tất cả bảng metadata nằm ở **SB1** (schema riêng, ví dụ `backup`), vì SB1 là nơi đã đặt admin/audit. Dữ liệu dump **không** nằm trong DB.

### BackupJob — một lần chạy
`id`, `kind` (daily|weekly|monthly|pre_change), `snapshot_ts`, `status` (queued|running|succeeded|partial|failed|cancelled), `started_at`, `finished_at`, `triggered_by` (cron|admin|api), `actor_user_id`, `operation_label` (pre_change), `target_dbs[]`, `error`, `retry_of`.

### BackupSnapshot — một DB trong một job
`id`, `job_id`, `db_key` (sb1|sb2|sb3|sb4|r2|cloudinary), `version` (xem §4), `scope` (critical|full|media_manifest|media_bytes), `table_count`, `row_count_total`, `bytes`, `storage_uri`, `hash`, `status` (pending|writing|sealed|verified|invalid|expired), `sealed_at`, `verified_at`, `expires_at`, `parent_snapshot_id` (incremental/rollback).

### BackupManifest — mô tả bên trong snapshot (JSON lưu cạnh dump + bản ghi index trong DB)
`snapshot_id`, `db_key`, `snapshot_ts`, `source_url_masked`, `objects[]` = {kind: table|function|policy|trigger|media, name, source_db (bắt buộc cho `reports`), row_count, byte_size, hash, watermark}, `schema_version`, `app_commit`, `table_routes_hash` (hash của `TABLE_ROUTES` lúc chụp), `env_flags` {CONTENT_SYNC_ENABLED, cron_state}, `manifest_hash`.

### RestoreJob
`id`, `source_job_id`, `snapshot_ids[]`, `mode` (dry_run|partial|full), `target_env` (staging|production), `requested_by`, `approved_by` (≥2 người cho production), `approval_at`, `freeze_started_at`, `rollback_snapshot_id` (bắt buộc ≠ null khi target=production), `status` (draft|awaiting_approval|dry_run_passed|frozen|restoring|verifying|succeeded|rolled_back|failed), `failure_stage`, `notes`.

### RestoreVerification
`id`, `restore_job_id`, `check_key` (row_count | checksum | fk_integrity | wallet_balance_sum | reports_source_split | sb1_sb3_watermark_match | media_presence | rls_present | rpc_present | smoke_route), `db_key`, `expected`, `actual`, `delta`, `severity` (info|warn|block), `result` (pass|fail), `checked_at`.
Quy tắc: còn 1 `block/fail` → hệ thống **không** được mở lại ghi.

### RecoveryLog — append-only
`id`, `at`, `actor_user_id`, `action`, `job_id`/`restore_job_id`, `before_state`, `after_state`, `reason`, `ip`, `user_agent`, `hash_prev` (chuỗi hash liên kết chống sửa).
**Không** cấp quyền UPDATE/DELETE cho bất kỳ role ứng dụng nào; chỉ INSERT + SELECT.

---

## 3. Lưu ở đâu

| Loại | Nơi lưu | Lý do |
|---|---|---|
| Metadata (6 bảng trên) | SB1, schema `backup`, RLS chỉ Bang Chủ / service role | cùng nơi audit, nhỏ, cần truy vấn |
| Dump DB (daily/weekly/monthly) | R2 prefix `backups/<db>/<kind>/<version>/` | tách khỏi Supabase, chi phí thấp, hỗ trợ lifecycle |
| Manifest JSON | cạnh dump **và** bản sao index trong SB1 | mất R2 vẫn biết đã có gì |
| Media bytes (monthly) | R2 prefix `recovery/<version>/media/` | gói đầy đủ |
| Media manifest weekly | R2 + index SB1 | phát hiện file thiếu mà không tốn egress |
| Bản sao ngoài (lớp 3) | monthly mới nhất copy sang một bucket/ổ khác chủ thể | chống mất cả R2 |
| Khóa/secret | Secret store của Lovable, không nằm trong dump | không backup credential |

---

## 4. Version snapshot & điều kiện đủ để restore

**Version:** `<db_key>-<kind>-<YYYYMMDDTHHmmZ>-<seq>-<short_hash>`
ví dụ `sb3-daily-20260922T0200Z-01-9f2c1ab`. `seq` cho lần chạy lại trong cùng mốc; `short_hash` = 8 ký tự đầu của `manifest_hash`.
**Snapshot Set:** các snapshot cùng `job_id` tạo thành một bộ; tên bộ = `set-<kind>-<snapshot_ts>`. Restore luôn tham chiếu **bộ**, không tham chiếu file lẻ.

**Snapshot đủ điều kiện restore (`verified`) khi tất cả đúng:**
1. `status = sealed` và `hash` khớp hash tính lại từ storage.
2. `manifest_hash` khớp; số object trong manifest = số object thực trên storage.
3. Đủ mặt các DB bắt buộc của `kind` (daily: SB1+SB3+SB4; weekly/monthly: SB1–SB4 + media manifest).
4. `sb1.reports` và `sb4.reports` đều có mặt và ghi đúng `source_db`.
5. Chênh lệch watermark SB1 ↔ SB3 trong ngưỡng cho phép (ví dụ ≤ 60s) — nếu vượt, đánh `partial`.
6. Không bảng bắt buộc nào có `row_count = 0` trong khi snapshot trước đó > 0 (cảnh báo tụt dữ liệu).
7. Dry-run restore vào staging đã từng `pass` cho bộ đó (áp dụng cho monthly/pre_change).
8. Chưa `expired`.

---

## 5. Emergency Recovery — thứ tự bắt buộc

1. **Tuyên bố sự cố** → tạo `RestoreJob` (draft) + ghi `RecoveryLog`.
2. **Chọn bộ snapshot** ở trạng thái `verified`, cùng `snapshot_ts` cho SB1/SB3/SB4 và cùng version media.
3. **Kiểm tra sync**: đọc `CONTENT_SYNC_ENABLED` và trạng thái cron **ngoài repo** (pg_cron, scheduler ngoài, endpoint `/api/public/sync-content-to-s3`). Nếu sync SB1→SB3 đang chạy → **tắt/freeze trước**, xác nhận bằng log 0 request.
4. **Freeze ghi**: bật maintenance (đã có route `maintenance.tsx`), thu hồi quyền ghi ở tầng DB cho role ứng dụng, dừng bot/automation, dừng cron. Ghi `freeze_started_at`.
5. **Rollback snapshot**: chụp trạng thái hiện tại (dù đang lỗi) → `rollback_snapshot_id`. Không có bước này thì **không** được restore production.
6. **Dry-run** trên staging/project tạm với đúng bộ đó; chạy `RestoreVerification`.
7. **Restore production** theo thứ tự phụ thuộc: SB1 (identity/ví) → SB4 (reports/albums/zalo) → SB3 (nội dung) → media theo mapping cùng version. Restore vào schema tạm rồi swap, không ghi đè bảng sống trực tiếp.
8. **Verify** (mục 2 `RestoreVerification`) — bắt buộc trước khi mở lại.
9. **Mở lại** theo bậc: admin → một phần user → toàn bộ; bật lại cron/sync **sau cùng** và chỉ khi watermark đã khớp.
10. **Hậu kiểm 24h** + báo cáo ghi vào `RecoveryLog`.

**Điều cấm tuyệt đối:**
- Không gọi `admin_import_all_data` (hay bất kỳ import hàng loạt) trực tiếp trên production.
- Không restore riêng lẻ `wallets` / `transactions` / `withdrawals` — chỉ restore cả khối tài chính SB1 theo cùng mốc.
- Không merge `sb1.reports` với `sb4.reports`.
- Không restore DB mà bỏ media (và ngược lại) khác version.
- Không tạo bất kỳ cơ chế xóa log, xóa dấu vết, hay bypass audit.

**Nếu restore fail giữa chừng:** dừng ngay tại `failure_stage`, giữ freeze, restore `rollback_snapshot_id`, verify lại, ghi log; chỉ thử lần 2 sau khi có nguyên nhân. Mỗi bước restore phải idempotent và có thể chạy lại từ đầu bước đó.

---

## A. Có thể làm ngay bằng code hiện tại
- Bảng metadata `backup.*` + trang admin đọc/ghi qua Database Router (SB1) — schema đã có sẵn khuôn mẫu RLS/`has_role`.
- Job export theo bảng bằng `@supabase/supabase-js` + anon/service key, ghi lên R2 qua `@aws-sdk/client-s3` (đã có trong `package.json`, đã có tiền lệ ở `scripts/migrate-content-to-s3.mjs`).
- Danh mục bảng cho từng lớp snapshot sinh tự động từ `TABLE_ROUTES` + `supabase-sql/SB1..SB4`.
- Checksum (SHA-256), manifest JSON, versioning, row-count, media manifest từ R2 `ListObjectsV2`.
- Endpoint cron nội bộ dưới `src/routes/api/public/*` có xác thực chữ ký/secret header.
- Dry-run + verify report (đọc, so sánh, không ghi).
- Freeze bằng maintenance route + cờ cấu hình.

## B. Cần thêm secret / quyền
- `SERVICE_ROLE_KEY` riêng cho **từng** SB1–SB4 (hiện repo chỉ có publishable/anon) — bắt buộc để dump đủ bảng/RLS.
- `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (bucket backup riêng, khác bucket media).
- `BACKUP_CRON_SECRET` cho endpoint cron.
- Cloudinary API key/secret nếu muốn manifest/bytes Cloudinary.
- (Tùy chọn) Supabase Management API PAT nếu muốn dump schema/policy tự động thay vì SQL thủ công.
- Kênh thông báo (email/webhook) cho job fail.

## C. Cần kiểm tra trên Dashboard Supabase (từng project SB1–SB4)
1. PITR/backup gói hiện tại còn hiệu lực bao lâu, có bật hay không.
2. Danh sách **cron ngoài repo**: `pg_cron`, `pg_net`, webhook, trigger gọi HTTP.
3. Function/RPC nguy hiểm còn tồn tại: `admin_import_all_data`, `*_PURGE_MEMBER`, soft-delete-all-posts.
4. RLS/policy hiện hành và grants cho `anon`/`authenticated` (để verify sau restore).
5. Storage buckets còn dùng (SB2, avatars `zbuwddjcqdlyijcunwgd`) và dung lượng/egress.
6. Replication/publication realtime đang bật cho bảng nào (ảnh hưởng khi restore SB3).
7. Ngưỡng egress còn lại — dump toàn bộ sẽ tốn egress.

## D. Tuyệt đối KHÔNG tự động hóa
- Restore lên production (luôn cần 2 người phê duyệt + thao tác tay).
- Ghi đè / TRUNCATE bảng tài chính SB1 và `user_roles` / `bangchu`.
- Bật lại `CONTENT_SYNC_ENABLED` hoặc cron sau sự cố.
- Quyết định chọn bộ snapshot khi SB1/SB3/SB4 lệch mốc.
- Xóa snapshot/rollback snapshot, xóa `RecoveryLog` (chỉ hết hạn theo lifecycle có phê duyệt).
- Merge/ghép `reports` giữa SB1 và SB4.
- Chạy bất kỳ file `RUN_NOW_*.sql` / `*_PURGE_*` theo lịch.

## E. Thứ tự triển khai an toàn nhất
1. Chốt danh mục bảng & nguồn thật cho từng lớp snapshot (đọc, không sửa) — xuất ra file cấu hình.
2. Xin secret ở mục B; tạo bucket backup riêng + lifecycle.
3. Tạo schema `backup.*` (chỉ thêm bảng mới, không chạm bảng nghiệp vụ) + RLS/grants.
4. Viết exporter **read-only** + manifest + checksum; chạy thử trên 1 bảng nhỏ của SB4.
5. Bật Daily cho SB4 → SB3 → SB1 (tăng dần), theo dõi egress.
6. Thêm Weekly (schema/policy/RPC) rồi Monthly (media + bytes).
7. Làm Pre-Change Snapshot + chặn thao tác nguy hiểm khi chưa có snapshot.
8. Xây dry-run restore trên project staging; chạy diễn tập recovery.
9. Xây verify suite + freeze/unfreeze có kiểm soát.
10. Diễn tập emergency recovery đầy đủ (có rollback) rồi mới coi "Đường Lui" là sẵn sàng.
