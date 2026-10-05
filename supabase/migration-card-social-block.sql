-- 名片區塊新增「社群追蹤卡片」(social)。可重複執行。
alter table public.profile_card_blocks drop constraint if exists profile_card_blocks_type_check;
alter table public.profile_card_blocks
  add constraint profile_card_blocks_type_check
  check (type in ('link', 'text', 'image', 'product', 'video', 'line', 'divider', 'social'));
