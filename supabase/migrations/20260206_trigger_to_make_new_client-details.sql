-- 1. Create the function that will handle the insertion
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.client_details (id, email, permission)
  values (
    new.id,           -- The UUID from auth.users
    new.email,        -- The email from auth.users
    'client'          -- Your desired default permission/role
  );
  return new;
end;
$$;

-- 2. Create the trigger to fire after a new user is created in auth.users
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();