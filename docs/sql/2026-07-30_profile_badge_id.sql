-- =====================================================================
--  Member Badge system — chạy 1 lần trong SQL Editor của DB cũ
--  (Supabase project: zbuwddjcqdlyijcunwgd)
--
--  Mỗi user thường được random 1 badge cố định, lưu ở profiles.badge_id.
--  Admin chính (is_admin) dùng 👑, clone VIP (is_virtual) dùng ✔️ —
--  hai nhóm này không cần badge_id.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS badge_id text;

-- Backfill deterministic cho tài khoản cũ (hash từ uuid) — trùng khớp với
-- hàm badgeIdForUser() ở frontend về mặt "không đổi khi reload".
DO $$
DECLARE
  ids text[] := ARRAY[
    'woozy','angry','rage','sneeze','teary','pleading','shh','giggle','peek','gasp',
    'devil','imp','ogre','robot','alien','cat','cat_grin','cat_joy','cat_love','cat_smirk',
    'cat_kiss','cat_scream','cat_cry','unicorn','dragon_face','dragon','eagle','peacock','swan','dove',
    'parrot','owl','penguin','chick','baby_chick','hatching','fox','wolf','tiger','lion',
    'leopard','deer','bison','rhino','hippo','horse','dog','cat_pet','black_cat','guide_dog',
    'service_dog','monkey','orangutan','gorilla','butterfly','ladybug','bee','scorpion','snail','crab',
    'octopus','lobster','squid','shrimp','fish','blowfish'
  ];
BEGIN
  UPDATE public.profiles p
     SET badge_id = ids[1 + (abs(hashtext(p.id::text)) % array_length(ids, 1))]
   WHERE p.badge_id IS NULL
     AND COALESCE(p.is_admin, false) = false;
END $$;
