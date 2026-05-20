-- migration
create table settings (
  key text primary key,
  value text not null,
  updated_at datetime not null default current_timestamp
);

insert into settings(key, value) values
('default_voting_time_sec', '60'),
('default_speech_time_sec', '120'),
('default_reaction_time_sec', '30'),
('voting_mode', 'public'),
('conference_name', 'Instantni Summit'),
('committee_name', 'Rada EU'),
('admin_pin_is_default', 'true'),
('screen_pin_is_default', 'true');
