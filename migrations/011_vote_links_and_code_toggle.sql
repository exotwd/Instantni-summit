alter table delegations add column access_code_enabled boolean not null default false;
alter table delegations add column vote_link_token text;
alter table delegations add column vote_link_created_at datetime;

create unique index if not exists idx_delegations_vote_link_token on delegations(vote_link_token) where vote_link_token is not null;
