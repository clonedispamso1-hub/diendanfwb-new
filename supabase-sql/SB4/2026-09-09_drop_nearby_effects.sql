-- Supabase #4 — Xoá dữ liệu cấu hình HIỆU ỨNG cũ của "Tìm Xung Quanh".
-- Chạy trong SQL Editor. An toàn khi chạy lại nhiều lần.
delete from public.nearby_settings
where key in ('nearby_effects', 'nearby_sprite_sheets', 'nearby_effect_slots');
