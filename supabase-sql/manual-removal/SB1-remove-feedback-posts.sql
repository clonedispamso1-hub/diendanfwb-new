-- RUN ONLY in SB1: gxfxqbhxoghdhokwjpex
-- CASCADE removes dependent policies and indexes with the retired table.
begin;
drop table if exists public.feedback_posts cascade;
commit;
