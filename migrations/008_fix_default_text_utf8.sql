-- Repairs default EU delegation names/flags in databases created from an earlier
-- Windows-encoded seed file. Custom access codes, attendance and participants
-- are preserved.
update delegations set name = 'Rakousko', flag = '🇦🇹' where code = 'AT';
update delegations set name = 'Belgie', flag = '🇧🇪' where code = 'BE';
update delegations set name = 'Bulharsko', flag = '🇧🇬' where code = 'BG';
update delegations set name = 'Chorvatsko', flag = '🇭🇷' where code = 'HR';
update delegations set name = 'Kypr', flag = '🇨🇾' where code = 'CY';
update delegations set name = 'Česko', flag = '🇨🇿' where code = 'CZ';
update delegations set name = 'Dánsko', flag = '🇩🇰' where code = 'DK';
update delegations set name = 'Estonsko', flag = '🇪🇪' where code = 'EE';
update delegations set name = 'Finsko', flag = '🇫🇮' where code = 'FI';
update delegations set name = 'Francie', flag = '🇫🇷' where code = 'FR';
update delegations set name = 'Německo', flag = '🇩🇪' where code = 'DE';
update delegations set name = 'Řecko', flag = '🇬🇷' where code = 'GR';
update delegations set name = 'Maďarsko', flag = '🇭🇺' where code = 'HU';
update delegations set name = 'Irsko', flag = '🇮🇪' where code = 'IE';
update delegations set name = 'Itálie', flag = '🇮🇹' where code = 'IT';
update delegations set name = 'Lotyšsko', flag = '🇱🇻' where code = 'LV';
update delegations set name = 'Litva', flag = '🇱🇹' where code = 'LT';
update delegations set name = 'Lucembursko', flag = '🇱🇺' where code = 'LU';
update delegations set name = 'Malta', flag = '🇲🇹' where code = 'MT';
update delegations set name = 'Nizozemsko', flag = '🇳🇱' where code = 'NL';
update delegations set name = 'Polsko', flag = '🇵🇱' where code = 'PL';
update delegations set name = 'Portugalsko', flag = '🇵🇹' where code = 'PT';
update delegations set name = 'Rumunsko', flag = '🇷🇴' where code = 'RO';
update delegations set name = 'Slovensko', flag = '🇸🇰' where code = 'SK';
update delegations set name = 'Slovinsko', flag = '🇸🇮' where code = 'SI';
update delegations set name = 'Španělsko', flag = '🇪🇸' where code = 'ES';
update delegations set name = 'Švédsko', flag = '🇸🇪' where code = 'SE';

update resolution_points
set text = 'Členské státy potvrzují závazek ke koordinovanému a věcnému jednání.'
where number = 1 and source_amendment_id is null;

update resolution_points
set text = 'Výsledná doporučení budou formulována s ohledem na proveditelnost a transparentnost.'
where number = 2 and source_amendment_id is null;
