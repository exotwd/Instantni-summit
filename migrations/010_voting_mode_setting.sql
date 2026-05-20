insert into settings(key, value)
select 'voting_mode', 'public'
where not exists (select 1 from settings where key = 'voting_mode');
