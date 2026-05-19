create table agenda_items (
  id integer primary key,
  title text not null,
  type text not null check (type in ('session','break','caucus','voting','organizational','other')),
  starts_at datetime,
  ends_at datetime,
  note text,
  display_order integer not null default 0,
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp
);

create index idx_agenda_order on agenda_items(display_order);
