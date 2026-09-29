# Supported mechanics vocabulary

- **Named keywords:** [keywords.json](keywords.json). Put their uppercase IDs in
  a creature's `keywords` array. Only Mycelium Network exists today.
- **Engine effect primitives:** [effects.json](effects.json). Copy the exact
  lowercase `type` and consult `parameters`, `rulesNotes`, and `example`.
- **Exact accepted effect shapes:** [effect.schema.json](../schemas/effect.schema.json).
  Schema and runtime checks reject ignored parameters and unusable combinations.

## Triggers

| ID                  | When it happens                              | Limits                                                                                           |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `on_cast`           | A spell is played                            | SPELL only                                                                                       |
| `on_summon`         | A non-spell is played                        | Not when a token appears; artifacts are still unattached                                         |
| `on_upkeep`         | The controller's upkeep                      | Deployed sources; artifacts must be attached, except energy regeneration                         |
| `on_death`          | A battlefield creature enters the graveyard  | CREATURE only; does not trigger for hand discards                                                |
| `on_play_equipment` | The controller plays an artifact             | Each deployed friendly source triggers, including the new artifact; attaching is not playing     |
| `constant`          | Recomputed while the source applies          | Only supported passive effects and attached/network stat modifiers                               |
| `on_attack`         | Each friendly creature is declared attacking | Only `gain_attack`, target `attacking_creature`, duration `end_of_turn`; every attacker benefits |
| `on_equip`          | Derived while this creature has an artifact  | Only `conditional_gain_attack`; this is a continuous condition, not a queued event               |

The first five triggers can be used with the ordinary queued effects in the
dictionary. The remaining three are specialized. A trigger being listed does not
mean it works with every effect. Spells require `on_cast`; they cannot keep a
passive effect running from the graveyard.

## Targets

| ID                                            | Meaning                                                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `enemy_creature`                              | Select an opponent's battlefield creature for damage                                                                   |
| `creature_or_player`                          | Select either player's creature or either player for damage                                                            |
| `creature`                                    | Damage: any battlefield creature. Recovery: your graveyard creature. Artifact stat/healing effect: its attached bearer |
| `equipment` / `enemy_equipment`               | Select any artifact / an opponent's artifact for destruction                                                           |
| `enchantment` / `enemy_enchantment`           | Select any augmentation / an opponent's augmentation for destruction                                                   |
| `equipped_creature`                           | The artifact's bearer, without another target prompt                                                                   |
| `enchanted_creature`                          | The augmentation's bearer, selected among friendly creatures when it is played                                         |
| `all_enemy_creatures`                         | Apply a queued stat change to all opponent creatures                                                                   |
| `all_creatures_you_control`                   | Apply a queued stat change to all friendly creatures                                                                   |
| `creatures_you_control_with_mycelium_network` | A constant stat bonus to friendly network creatures                                                                    |
| `attacking_creature`                          | Each friendly attacker; used only for the attack-trigger bonus                                                         |

Effects without a target parameter (drawing, energy, token creation, cost
reduction, and the equipped attack condition) affect their controller or source
as described. Do not add `target` to those effects.

## Important boundaries

- `value` is a whole number. Counts, damage, healing and reductions are nonnegative;
  `gain_attack`, `gain_defense` and `conditional_gain_attack` accept negatives.
- Temporary attack and energy accept `this_turn` or `end_of_turn`, both expiring
  at the active turn's end. Temporary health changes are not implemented.
- Attached bonuses require an attachment, not a creature with an attachment target.
  Use `enchanted_creature` on an augmentation so the UI knows to select a bearer.
- Constants disappear when their source leaves or detaches. Queued stat changes
  become bonuses on the affected match card and persist until recovery resets them;
  temporary attack bonuses expire at turn end.
- Network stat bonuses apply to network creatures and, if that source also has an
  attachment, its bearer. Keep global network auras separate from targeted
  augmentations unless you want that existing combined behavior.
- Effects described as "may" in older card text still resolve when a legal target
  exists. Optional effects, a stack, and player-defined scripts are not implemented.
- Tokens use the editable `token:sporeling` definition. `summon_token.value` controls
  quantity; putting token names or stats inside an effect is invalid.

To change existing cards, edit the cards, not this reference or the schemas.
Updating documentation cannot give the engine a new behavior.
