create table if not exists cases_metadata (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  platform text,
  threat_type text,
  threat_score integer,
  sourcing_date timestamp with time zone,
  is_in_takedown boolean default false,
  takedown_status text,
  caption text,
  image_key text,
  profile_username text,
  posting_time timestamp with time zone
);

alter table cases_metadata enable row level security;

create policy "Enable read access for all users"
on cases_metadata for select
using (true);

create policy "Enable insert for authenticated users only"
on cases_metadata for insert
with check (auth.role() = 'authenticated');

create policy "Enable update for authenticated users only"
on cases_metadata for update
using (auth.role() = 'authenticated');
