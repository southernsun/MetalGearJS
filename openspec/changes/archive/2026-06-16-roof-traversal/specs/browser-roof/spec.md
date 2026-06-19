# browser-roof delta

## ADDED Requirements

### Requirement: The moving bridges protect and drop

Rooms 45/46 SHALL run their eight walkway segments per BridgeLogic — each at its BridgesSpeeds rate, all reversing every 0x20 iterations. Touching a segment (touch shape 7) SHALL only set the on-bridge flag — the ROM never carries Snake, he keeps his own footing; standing over the chasm tiles with no segment underfoot triggers the fall (ChkOnBridge).

#### Scenario: Crossing the walkway

- **WHEN** Snake stands on a moving segment
- **THEN** he stays put while it slides under him; stepping over the chasm with no segment underfoot drops him off the roof

### Requirement: Falls follow ChkParachute

A roof fall (the bridge gaps, or room 117's jump edge) SHALL cut to the brick wall (room 204) in parachute control — two screens of 1px/iteration drift with the sway — landing in room 5, 6, or 10 by origin, ONLY when the PARACHUTE is selected; without it Snake lands in the yard dead (FreeFall). The alert stops on the jump.

#### Scenario: No parachute

- **WHEN** Snake walks off the roof without the parachute selected
- **THEN** he lands in the yard with zero life

### Requirement: The room-53 wind needs the bomb blast suit

Room 53's air-flow band SHALL push Snake back up (3px/iteration until Y < 0x30) whenever he enters it without the BOMB BLAST SUIT selected; with the suit selected he walks through.

#### Scenario: The gate

- **WHEN** Snake enters the band without the suit
- **THEN** the wind throws him back; selecting the suit lets him pass

### Requirement: The jetpack event electrifies room 40

Room 40's jetpack guard SHALL descend to the wall switch (raising the alarm and arming 0x5A reinforcements), flip it with the click — creating the power switch actor and turning the electric floor LIVE — then take off and hover, sniping at Snake on a random cadence; rooms 44/48's takeoff guards launch into the same hover. Jetpacks have 2 life.

#### Scenario: The flip

- **WHEN** the descending guard reaches the switch
- **THEN** the click sounds, the floor goes live, and he takes off

### Requirement: Sentinels watch their posts

Sentinel guards SHALL stand at their actor positions cycling their look direction through their per-actor direction list, seeing Snake through the normal LOS; the alarm transforms them into normal chasers.

#### Scenario: The watch cycle

- **WHEN** a sentinel's wait elapses
- **THEN** he faces the next direction in his list without leaving his post
