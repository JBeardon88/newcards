# Engine test cards

`content.json` is a frozen test fixture captured during the content migration.
It contains the original 44 cards after normalization, the Sporeling token and
their supporting configuration. It is imported only by tests, never by the app.

Designers edit root `content/`, not this fixture. The lifecycle suite uses these
stable examples so changing a card name, cost or rarity does not break tests of
combat, targeting, settlement or persistence. Content tests separately validate
the live authored files. The migration fingerprint tests the loader against the
old runtime definitions, excluding four legacy fields the engine never read
(`token_name`, token `attack`/`defense`, and `destination`).

Engine changes may need new fixture examples and tests. Ordinary card balancing
does not require updating this fixture or its fingerprint.
