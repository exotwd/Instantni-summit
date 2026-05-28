-- Replace the built-in resolution seed with the fixed conclusion template.
-- Points with source_amendment_id is null are the immutable template.
update amendments
set target_point_id = null, updated_at = current_timestamp
where target_point_id in (
  select id from resolution_points where source_amendment_id is null
);

delete from resolution_points
where source_amendment_id is null;

insert into resolution_points(number, text, status, source_amendment_id) values
(1, 'odvolávajíc se na zakládající smlouvy EU,', 'active', null),
(2, 'přihlížejíc k Úmluvě o ochraně lidských práv a základních svobod,', 'active', null),
(3, 'podporuje…', 'active', null);

update resolution_points
set number = 3 + (
  select count(*)
  from resolution_points rp2
  where rp2.status = 'active'
    and rp2.source_amendment_id is not null
    and (
      rp2.number < resolution_points.number
      or (rp2.number = resolution_points.number and rp2.id <= resolution_points.id)
    )
)
where status = 'active' and source_amendment_id is not null;

insert into resolution_points(number, text, status, source_amendment_id)
select coalesce(max(number), 0) + 1, 'bude se situací dále aktivně zabývat.', 'active', null
from resolution_points
where status = 'active';

update state_revisions
set revision = revision + 1, updated_at = current_timestamp
where name in ('resolution', 'amendments');
