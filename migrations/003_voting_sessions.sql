create table voting_sessions (
  id integer primary key,
  amendment_id integer references amendments(id),
  status text not null check (status in ('preparing','open','closed','saved','cancelled')),
  started_at datetime,
  closed_at datetime,
  time_limit_sec integer not null,
  revision integer not null default 1,
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp
);

create table votes (
  id integer primary key,
  voting_session_id integer not null references voting_sessions(id) on delete cascade,
  delegation_id integer not null references delegations(id) on delete cascade,
  choice text not null check (choice in ('for','against','abstain','absent')),
  source text not null check (source in ('admin','delegate')),
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp,
  unique(voting_session_id, delegation_id)
);

create index idx_voting_sessions_status on voting_sessions(status);
create index idx_votes_session on votes(voting_session_id);
