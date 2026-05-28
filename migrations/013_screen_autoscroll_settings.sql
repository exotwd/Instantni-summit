insert into settings(key, value)
select 'screen_resolution_autoscroll', 'true'
where not exists (select 1 from settings where key = 'screen_resolution_autoscroll');

insert into settings(key, value)
select 'screen_resolution_scroll_speed', '10'
where not exists (select 1 from settings where key = 'screen_resolution_scroll_speed');
