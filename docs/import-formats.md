# Import Formats

The admin UI supports XLSX, CSV, and TSV imports for selected operational data.

General rules:

- The first row must contain column headers.
- Column names are case-insensitive.
- Czech and English headers are accepted where listed below.
- XLSX imports read the first worksheet.
- CSV uses comma separation, TSV uses tab separation.
- Empty rows are ignored where possible.

## Seat Layout Import

Open `Rozložení a prezence` and click `Import rozložení`.

The import updates existing delegation tables. It does not create or delete delegations.

Matching priority:

1. `Delegation ID`
2. `Zkratka` / `Code`
3. `Stát` / `Country` / `Delegace` / `Delegation`

Required matching column:

- At least one of `Delegation ID`, `Zkratka`, or `Stát`.

Position columns:

| Column | Required | Description |
| --- | --- | --- |
| `X` | yes | Horizontal position in percent, from `0` to `100`. |
| `Y` | yes | Vertical position in percent, from `0` to `100`. |
| `W` / `Width` / `Šířka` | no | Table width in percent. Defaults to `10`. |
| `H` / `Height` / `Výška` | no | Table height in percent. Defaults to `8`. |
| `Rotation` / `Rotace` / `R` | no | Rotation in degrees, from `-180` to `180`. Defaults to `0`. |

Example CSV:

```csv
Zkratka,Stát,X,Y,W,H,Rotation
CZ,Česko,44,8,10,7,0
DE,Německo,10,30,9,6,90
FR,Francie,10,45,9,6,90
SE,Švédsko,82,45,9,6,-90
```

Notes:

- Values are clamped so tables stay inside the stage.
- Hidden/visible table state is managed manually in the UI and is not changed by layout import.
- Chair table position is still edited by dragging it in the layout screen.

## Agenda Import

Open `Agenda` and click `Import agendy`.

The import replaces the current agenda with the file contents. This prevents accidental duplicate agenda rows.

Columns:

| Column | Required | Description |
| --- | --- | --- |
| `Název` / `Title` / `Bod` | yes | Agenda item title. |
| `Typ` / `Type` | no | One of the values below. Defaults to `other`. |
| `Čas` / `Začátek` / `Start` | no | Start time. Use `HH:MM`, for example `08:35`. |
| `Trvání` / `Duration` / `Minutes` / `Min` | no | Duration in minutes. |
| `Poznámka` / `Note` / `Notes` | no | Full note. Supports the same lightweight formatting used in the admin UI, such as `**bold**` and `*italic*`. |
| `Pořadí` / `Order` / `Display Order` | no | Explicit ordering. If missing, file row order is used. |

Accepted type values:

| Czech | English/API value |
| --- | --- |
| `Jednání` | `session` |
| `Přestávka` | `break` |
| `Kuloární jednání` / `Caucus` | `caucus` |
| `Hlasování` | `voting` |
| `Organizační` | `organizational` |
| `Jiné` | `other` |

Example CSV:

```csv
Čas,Trvání,Název,Typ,Poznámka,Pořadí
07:45,15,Příprava,Organizační,Příchod delegací,1
08:00,30,Úvod,Jiné,Pravidla a program,2
08:30,5,Přestávka 1,Přestávka,,3
08:35,45,Hlasování o PN,Hlasování,"**Důležité:** připravit projekci",4
```

Time handling:

- Use 24-hour `HH:MM` format.
- Excel time-only cells are accepted.
- The date part is ignored by the UI; agenda displays only time and duration.

## Attendance And Preference Imports

Attendance import remains in `Rozložení a prezence` as `Import XLSX`.

Required matching column:

- `Delegation ID`, or
- `Zkratka`, or
- `Stát`.

Participant columns:

- `Jméno účastníka`
- `E-mail účastníka`
- `Poznámka`

Preference import remains in `Rozložení a prezence` as `Import preferencí XLSX`.

Expected preference columns:

- `Jméno`
- `E-mail`
- one or more `Preference zastupování...` columns
- one or more `Antipreference...` columns
- optional `Třída`
- optional participation column beginning with `Chci se účastnit`

Preference import assigns at most one participant to each delegation and skips assignments that would violate antipreferences.
