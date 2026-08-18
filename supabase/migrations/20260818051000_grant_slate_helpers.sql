-- The lineup screen needs to know which week it is building for and when that
-- week locks. Both are read-only derivations over already-readable data.
grant execute on function public.current_slate() to authenticated;
