## ADDED Requirements

### Requirement: Water — shallow and deep

In a water room, the tile under Snake SHALL put him into shallow water (tiles `0x73–0x74`, brick
`0x6D`, shadow `0x6F–0x72`; `PlayerAnimation=2`) or deep water (`0x75–0x76`; `PlayerAnimation=4`),
per `ChkWater`/`ChkWaterTiles`/`SetInWaterMode`/`SetDeepWaterMode`. Movement stays under normal
control; shallow water shows the wading sprite and deep water the swimming sprite. Returning to dry
land SHALL restore the walk animation. **Deep water without the oxygen tank** (`SELECTED_OXYGEN`)
SHALL drain life — 2 every 8 frames, gated by the shared damage-delay timer (`SetInWaterMode3` →
`DecrementLife_C`) — and reaching 0 life is death. The only feedback is the life bar falling: the
ROM's deep-water drain is **silent and does not blink** the sprite (unlike the electric floor,
which has its own SFX). (There is no item system yet, so there is no scuba tank to equip — deep
water always drains; the oxygen item that prevents it arrives with the item system.)

#### Scenario: Enter shallow water

- **WHEN** Snake moves onto a shallow-water tile in a water room
- **THEN** he shows the wading animation and keeps moving under normal control

#### Scenario: Enter deep water

- **WHEN** Snake moves onto a deep-water tile
- **THEN** he shows the swimming animation (deep-water mode)

#### Scenario: Deep water without oxygen drains life

- **WHEN** Snake is in deep water without the oxygen tank
- **THEN** he loses 2 life every 8 frames (life bar falling, no blink, no sound) and dies if his
  life reaches 0

#### Scenario: Leave water

- **WHEN** Snake moves back onto dry land
- **THEN** he returns to the normal walk animation and the drain/blink stops
