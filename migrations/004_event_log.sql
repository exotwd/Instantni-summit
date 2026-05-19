-- migration
create table event_log (
  id integer primary key,
  event_type text not null,
  actor_type text,
  actor_id text,
  payload_json text,
  created_at datetime not null default current_timestamp
);

create table state_revisions (
  name text primary key,
  revision integer not null default 1,
  updated_at datetime not null default current_timestamp
);

insert into state_revisions(name, revision) values
('voting',1),('speaker',1),('resolution',1),('attendance',1),('layout',1),
('break',1),('debate',1),('settings',1),('agenda',1);
