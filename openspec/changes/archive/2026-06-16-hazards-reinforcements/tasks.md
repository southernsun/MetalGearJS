# Tasks — hazards + reinforcements

## 1. ROM survey

- [x] 1.1 gas.asm, rollingbarrels.asm, powerswitch.asm + damageelectric.asm,
      camera/chkdiscover (the touch branch + the 0x28 respawn arm), ChkRespawnEnemy +
      respawninfo.asm (3 bytes/room, packed nibble locations), DismissActor8 (silencer
      drop), guardsupressor.asm, hideguards.asm (noted; entry-removal is a later nicety)
- [x] 1.2 Tables: camera touch shape 8 + damage 0x10; barrel damage 0xFF; switch life 2;
      electric tile pairs per room

## 2. Implementation

- [x] 2.1 export-actors.mjs: guard variants (medium/silencer/alert/redalert + speeds),
      gas, barrels, powerswitch; export-respawn.mjs NEW -> respawn.json (96 rooms);
      gas.png/barrel.png (the generic --export-actor flag); barrel-hit.wav/electric.wav
- [x] 2.2 game.js: gasClouds/barrels/powerSwitch+electric floor systems; camera touch
      (zap + red alert + the 0x28 arm); respawnTick (caps, the 188 cutoff, disarm on
      alarm end, red-alert arm); guard variant spawn (alert-born, speeds); the silencer
      suppressor drop; shotTarget includes the power switch

## 3. Checks

- [x] 3.1 hazards.headless.mjs: 21 checks — all suites green
- [ ] 3.2 User batch playtest (end of run)
