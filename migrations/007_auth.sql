create table auth_tokens (
  id integer primary key,
  role text not null check (role in ('admin','screen')),
  token_hash text not null,
  created_at datetime not null default current_timestamp,
  expires_at datetime not null,
  revoked_at datetime
);

create index idx_auth_tokens_hash on auth_tokens(token_hash);
