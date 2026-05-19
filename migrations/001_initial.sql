create table delegations (
  id integer primary key,
  name text not null,
  code text not null unique,
  flag text not null,
  access_code text,
  access_code_created_at datetime,
  present boolean not null default false,
  display_order integer not null default 0,
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp
);

create table participants (
  id integer primary key,
  delegation_id integer not null references delegations(id) on delete cascade,
  name text,
  email text,
  co_delegate_name text,
  co_delegate_email text,
  note text,
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp,
  unique(delegation_id)
);

create table attendance_records (
  id integer primary key,
  delegation_id integer not null references delegations(id) on delete cascade,
  participant_id integer references participants(id) on delete set null,
  present boolean not null,
  access_code text,
  checked_at datetime not null default current_timestamp,
  checked_by text,
  note text
);

create table seat_layout (
  id integer primary key,
  delegation_id integer not null references delegations(id) on delete cascade,
  x real not null default 0,
  y real not null default 0,
  w real not null default 10,
  h real not null default 10,
  rotation real not null default 0,
  revision integer not null default 1,
  updated_at datetime not null default current_timestamp,
  unique(delegation_id)
);

create table amendments (
  id integer primary key,
  number integer unique,
  type text not null check (type in ('add','update','remove')),
  target_point_id integer references resolution_points(id),
  submitter_delegation_id integer references delegations(id),
  submitter_name text,
  guarantors_text text,
  text text not null,
  status text not null,
  introduced_at datetime,
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp
);

create table amendment_guarantors (
  id integer primary key,
  amendment_id integer not null references amendments(id) on delete cascade,
  delegation_id integer not null references delegations(id) on delete cascade,
  unique(amendment_id, delegation_id)
);

create table resolution_points (
  id integer primary key,
  number integer not null,
  text text not null,
  status text not null check (status in ('active','removed','draft')),
  source_amendment_id integer references amendments(id),
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp,
  removed_at datetime
);

create table speaker_state (
  id integer primary key,
  current_delegation_id integer references delegations(id),
  active_reaction_delegation_id integer references delegations(id),
  current_started_at datetime,
  current_paused_ms integer not null default 0,
  revision integer not null default 1,
  updated_at datetime not null default current_timestamp
);

create table speaker_queue (
  id integer primary key,
  delegation_id integer not null references delegations(id) on delete cascade,
  position integer not null,
  created_at datetime not null default current_timestamp,
  unique(delegation_id)
);

create table speaker_reactions (
  id integer primary key,
  delegation_id integer not null references delegations(id) on delete cascade,
  position integer not null,
  status text not null check (status in ('waiting','active','finished')),
  created_at datetime not null default current_timestamp,
  started_at datetime,
  unique(delegation_id)
);

create table debate_sessions (
  id integer primary key,
  amendment_id integer references amendments(id),
  submitter_delegation_id integer references delegations(id),
  supporter_delegation_id integer references delegations(id),
  opponent_delegation_id integer references delegations(id),
  phase text not null,
  phase_started_at datetime,
  revision integer not null default 1,
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp
);

create table breaks (
  id integer primary key,
  type text not null check (type in ('caucus','coffee_break','custom_break')),
  title text not null,
  started_at datetime,
  ends_at datetime,
  status text not null check (status in ('active','ended')),
  revision integer not null default 1
);

insert into delegations(name, code, flag, display_order) values
('Rakousko','AT','🇦🇹',1),('Belgie','BE','🇧🇪',2),('Bulharsko','BG','🇧🇬',3),
('Chorvatsko','HR','🇭🇷',4),('Kypr','CY','🇨🇾',5),('Česko','CZ','🇨🇿',6),
('Dánsko','DK','🇩🇰',7),('Estonsko','EE','🇪🇪',8),('Finsko','FI','🇫🇮',9),
('Francie','FR','🇫🇷',10),('Německo','DE','🇩🇪',11),('Řecko','GR','🇬🇷',12),
('Maďarsko','HU','🇭🇺',13),('Irsko','IE','🇮🇪',14),('Itálie','IT','🇮🇹',15),
('Lotyšsko','LV','🇱🇻',16),('Litva','LT','🇱🇹',17),('Lucembursko','LU','🇱🇺',18),
('Malta','MT','🇲🇹',19),('Nizozemsko','NL','🇳🇱',20),('Polsko','PL','🇵🇱',21),
('Portugalsko','PT','🇵🇹',22),('Rumunsko','RO','🇷🇴',23),('Slovensko','SK','🇸🇰',24),
('Slovinsko','SI','🇸🇮',25),('Španělsko','ES','🇪🇸',26),('Švédsko','SE','🇸🇪',27);

insert into seat_layout(delegation_id, x, y, w, h, rotation)
select id, 4 + ((display_order - 1) % 7) * 13, 8 + cast((display_order - 1) / 7 as integer) * 16, 10, 10, 0
from delegations;

insert into speaker_state(id, revision) values (1, 1);

insert into resolution_points(number, text, status) values
(1, 'Členské státy potvrzují závazek ke koordinovanému a věcnému jednání.', 'active'),
(2, 'Výsledná doporučení budou formulována s ohledem na proveditelnost a transparentnost.', 'active');
