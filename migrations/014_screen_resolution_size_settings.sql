insert into settings(key, value)
select 'screen_resolution_font_size', '20'
where not exists (select 1 from settings where key = 'screen_resolution_font_size');

insert into settings(key, value)
select 'screen_resolution_line_height', '1.38'
where not exists (select 1 from settings where key = 'screen_resolution_line_height');

insert into settings(key, value)
select 'screen_resolution_font_weight', '430'
where not exists (select 1 from settings where key = 'screen_resolution_font_weight');
