create table if not exists client_details (
  id uuid references auth.users(id) on delete cascade primary key,
  permission text default 'user',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table client_details enable row level security;

create policy "Users can view own details"
on client_details for select
using (auth.uid() = id);

-- Policy to allow the service role (or specific admins) to update permissions would go here
-- For now, we rely on direct DB access or triggers to set initial permissions
