// One-off refresh of coverage-map.json for the routines implemented in the recent sessions but
// still defaulting to `todo`/`partial`. done = faithful reimplementation (documented divergences
// included); partial = behavioural stand-in/approximation. Run: node Tools/coverage/refresh.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const p = path.join(path.dirname(fileURLToPath(import.meta.url)), 'coverage-map.json');
const m = JSON.parse(fs.readFileSync(p, 'utf8'));
const byId = Object.fromEntries(m.components.map((c) => [c.id, c]));
const set = (id, status, names) => { const c = byId[id]; c.status = c.status || {}; for (const n of names) c.status[n] = status; };

// --- Add the enemy-mine actor file to hazards (was absent from the map entirely) ---
if (!byId.hazards.files.includes('logic/actors/mine.asm')) byId.hazards.files.push('logic/actors/mine.asm');

// ending-persistence — the ending cinematic (logic/ending.asm): sequence faithful; the explosion
// tile frames are a flash stand-in (we don't export ExploxionTiles).
set('ending-persistence', 'done', ['EndingSetup', 'EndingLogic', 'EndingLogic2', 'EndingLogic3',
  'EndingLogic4', 'EndingLogic5', 'EndingLogic6', 'EndingLogic7', 'NextEndingStatus', 'EndingLogic8',
  'EndingSetText__', 'EndingLogic9', 'EndingSetText_', 'EndingLogic10', 'EndingLogic11', 'EndingLogic12',
  'EndingSetText', 'EndingLogic13', 'EndingEscaping', 'EndingEscaping2', 'EndingTimerEnd', 'EndingTextBox',
  'EndingSnakeRun', 'EndingSnakeRun2', 'EndingSnakeRun3']);
set('ending-persistence', 'partial', ['EndingExplosion', 'EndingExplosion2', 'EndDrawExplosBig', 'EndDrawExplos']);

// title-boot — the attract demo (logic/gamedemo.asm): gameplay + radio-tutorial scenes ported.
set('title-boot', 'done', ['SetupDemoPlay', 'SetTutorialDemo', 'SetDemoPlay1', 'SetDemoPlay2',
  'SetDemoPlay3', 'SetDemoPlay4', 'SetDemoPlay5', 'SetDemoPlay6', 'GameDemoLogic', 'ShowGameTutorial',
  'NextTutorialStatus', 'TutorialDummy', 'DemoControler', 'DemoControler2', 'EndDemoMode',
  'idxDemoPlayCtrl', 'DemoGameplay1', 'DemoTutorial', 'DemoGameplay2']);

// mid-bosses — the desert tank-shell barrage (faithful).
set('mid-bosses', 'done', ['InitSpawnTankShell', 'SpawnTankShell', 'SpawnTankShell2', 'SpawnTankShell3',
  'InitTankShell', 'ThankShellLogic', 'ThankShellLogic2']);

// desert — desert security (uniform-gated lock-12 door, faithful; the room-103 compass redirect is
// separate and not in this file).
set('desert', 'done', ['InitDesertSecurity', 'DesertSecurityLogic', 'DesertSecurity1', 'DesertSecurity2',
  'ChkDesertGuardTxt', 'DesertSecurity3', 'DesertSecurity4']);

// finale — Big Boss fully rewritten to the corridor/crate AI + axis bullets + real SprBigBoss.
set('finale', 'done', ['InitBigBoss', 'BigBossLogic', 'BigBossSpeech', 'BigBossThink', 'BigBossSetRunAway',
  'BigBossSetSpr_', 'BBSetMovToPlayer', 'BigBossRun', 'BigBossShowUp', 'BB_Shoot', 'BigBossCover',
  'BigBossSetSpr', 'BigBossSetSpr2', 'BigBossSetSpr3', 'BBAimToPlayer', 'BBAimToPlayer2', 'BigBossCalcAway',
  'BigBossSetDir', 'BigBossSetSpeed', 'BigBossCalcAway2', 'BBSetDirToPlayer', 'BBCalcShowUpDir2',
  'BBChkTurnCorner', 'BBChkTurnCorner2', 'BBChkTurnCorner3', 'BBChkTurnCorner4', 'SetRandomWait1_20',
  'BBChkCovered', 'BBChkCovered2', 'BBChkCovered3', 'BBChkPlayerNear', 'BBChkShoot', 'CheckCrateColumn',
  'CheckCrateSize', 'BBChkUpDownCorridors', 'BigBossChkSpeedY']);
// the ending explosion actor — approximated as a flash.
set('finale', 'partial', ['BigExplosionLogic', 'BigExplosionLogic2', 'BigExplSprCols']);

// hazards — enemy land mines (faithful: contact + detector reveal; the VRAM bg-save is plumbing).
set('hazards', 'done', ['InitMines', 'DrawMine', 'DrawMines', 'DrawMines2', 'DrawMines3']);
set('hazards', 'out-of-scope', ['GetMineBackXY']);
// Room-16 switch guard (guardswitch.asm), suppressor guards (guardsupressor.asm) and the
// per-room HideGuards (hideguards.asm) are now ported into the guard system.
set('hazards', 'done', [
  // guardswitch.asm — the patrol/alarm/power-the-floor/guard-the-switch state machine
  'InitGuardSwitch', 'GuardSwitchLogic', 'GuardSwPatrol', 'GuardSwPatrol2', 'GuardSwTurn',
  'GuardSwLookNorth', 'GuardSwTurnLeft', 'GuardSwAlarm', 'GuardSwGoToSw', 'GuardSwWait',
  'GuardSwRight', 'GuardSwShot', 'GuardSwWaitSwitch', 'SetStatGoToSwitch',
  // guardsupressor.asm — the move-then-cross-fire AI + ChkChasePlayer
  'InitGuardSilencer', 'InitGuardSilencer2', 'GuardSilencerLogic', 'GuardSilencIdle',
  'GuardSilencMovShot', 'GuardSilencTurn', 'GuardSilencWalk', 'SetGuardSprId_', 'SetGuardSprId',
  'ChkChasePlayer', 'ChkChasePlayer2', 'ChkChasePlayer3',
  // hideguards.asm — the nine per-room entry-edge guard culls
  'HideGuardRoom1', 'HideGuardRoom1_2', 'HideGuardSpr', 'HideGuardRoom13', 'HideGuardRoom15',
  'HideGuardRoom17', 'HideGuardRoom18', 'HideGuardChkCoordN', 'HideGuardChkCoord',
  'HideGuardRoom19', 'HideGuardRoom22', 'HideGuardRoom35', 'HideGuardRoom39',
]);
// the switch guard's exact LOS checks are approximated by the generic guardSeesSnake (box-aware).
set('hazards', 'partial', ['GuardSwChkPlayer', 'GuardSwChkSee', 'GuardSwChkSeeY', 'GuardSwChkBox']);

// dogs-wing — the basement dogs now run the free-roaming DogBasementLogic (basementDogMove): sleep
// -> run (roam, turn at walls via the 8px probe) -> chase (re-aim on its axis with a bark). A
// placed dog starts asleep, a spawned dog (ID_SPAWN_DOG) starts running. The spawner's cross-room
// NumBasementDogs carry-over is approximated by placed dogs (documented divergence).
set('dogs-wing', 'done', ['InitDogBasement', 'InitRunningDog', 'SetVertDogSpeed', 'SetBaseDogSprSpeed',
  'SetDogHorSpeed', 'SetDogSprColNxStat', 'DogBasementLogic', 'DogBasementLogic2', 'DogBaseSleep',
  'DogBaseRun', 'DogBaseChase', 'ChkDogChgDir', 'ChkDogChgDir2', 'ChkDogChgDir3', 'ChkDogChgDir4',
  'ChkDogChgDir5', 'ChkDogChgDir6', 'ChkDogChgDir7', 'ChangeDogDir', 'DogSpeedDat', 'ChkDogNearPlayer',
  'ChkDogNearPlayer2', 'ChkDogNearPlayer3', 'ChkDogNearPlayer4']);
set('dogs-wing', 'partial', ['InitSpawnDog', 'SpawnDogInit2', 'SpawnDogLogic']);  // cross-room carry-over approximated
// the ambush shooters (shooter.asm; rooms 88/90/91 force the alarm, 206 doesn't): strafe sideways,
// fire VERTICAL bullets, return to start, transform into a chaser after 3 cycles / when the player closes in.
set('dogs-wing', 'done', ['InitShooter', 'InitShooter5', 'SetShooterDir', 'SetShooterDir2', 'ShooterLogic',
  'ShooterWait', 'ShooterSetDir', 'ShooterWalk', 'ShooterShot', 'ShooterTurnBack', 'ShooterHide',
  'ShooterHide2', 'SetRandomWait']);
// the player-entry Y-relocation (InitShooter2 / InitShooterRoom90/91 / InitShooterElev) is simplified —
// the exported positions are used instead of repositioning per the entry side.
set('dogs-wing', 'partial', ['InitShooter2', 'InitShooterRoom90', 'InitShooterRoom91', 'InitShooterElev']);

// doors — the breakable/secret WALLS (drawdoors.asm/erasedoor.asm render types 7-19) are ported:
// each is drawn closed from its own wall sprite (wall-N.png) and made solid (closedWallSolid), then
// opened by a punch/bomb/prison-wall-life and wiped away (drawDoors), revealing the open passage in
// the room art — the ROM's SaveBackgTiles/RestoreSavedTiles is replaced by the pre-rendered room PNG
// background (documented divergence). The enter logic (ChkDoors/ChkEnterDoor) skips the hidden doors
// (0x40/0x6C) and the IN-ROOM walls (dest === room: rooms 58/60/63/100/108, the 0x20 logic bit) so
// those open a passage without a room reload, while passage walls teleport.
set('doors', 'done', ['ChkDoors1', 'ChkEnterDoor', 'ChkEnterDoor2', 'ChkEnterDoor3', 'SetDoorOpen',
  'GetOpeningDoorDat', 'DrawDoorType', 'DrawWall', 'DrawBasemWall60', 'DrawBasemWall61',
  'DrawBasemWall59_96', 'DrawBasemWall58', 'DrawBasemWall63', 'DrawWallBuil3_108', 'DrawBasemWall93',
  'DrawBasemWall100', 'DrawWallBasem112', 'EraseDoorDat', 'EraseBasemWall60', 'EraseBasemWall61',
  'EraseBasemWall58', 'EraseBasemWall63', 'EraseBasemWall59', 'EraseBasemWall93', 'EraseWallBuil3_108',
  'EraseBasemWall112', 'ChkDesertDoorBuild2_']);
// RestoreSavedTiles (VRAM tile save/restore) -> the room PNG background; the per-wall erase WIPE
// direction is a single approximation. The lorry-door check stays a stand-in.
set('doors', 'partial', ['RestoreSavedTiles', 'ChkDoorLorry2']);

// radio-text — the SEND radio REPLY gates are now ported (ChkRadioReply -> radioReplyGate): Big Boss
// (0x85/0x13) orders "switch off your MSX" after room 111 (switchOffMsx, armed in setRoom via
// ChkSwitchMsxOff) and warns when bugged (transmiTaken -> text 50); Schneider (0x79/0x26) goes
// silent once captured; Jennifer (0x48) needs rank class >= 3. SetTextUnskippable (mode 2) and the
// incoming-call arming are in. Divergences: the MapZone>=5 ANTENNA gate, Jennifer's dead-brother
// gate, and the Madnar/text-15 gate reference unmodelled progression (they pass) -> ChkReplyMadnar.
set('radio-text', 'done', ['ChkRadioReply', 'ChkReplyBigBoss', 'ChkReplyBigBoss2', 'ChkReplyBigBoss3',
  'ChkReplyBigBoss4', 'ChkReplySchneider', 'ChkReplySchneider2', 'ChkReplyJeniffer', 'RadioReplyOk',
  'NoRadioReply', 'ChkRadioReceiv', 'RadioAutoReply2', 'SetTextUnskip2', 'ChkRadioCalls2']);
set('radio-text', 'partial', ['ChkReplyMadnar', 'ChkRadioCalls3']);

// ---- Remaining-todo sweep ----------------------------------------------------------------------
// Genuine small ports this pass: the bullet-proof vest halves damage (ChkUsingArmor -> damage()),
// and Metal Gear's destruction shows the emergency text (ShowEmergencyText -> setText(150) + the
// room-111 Big-Boss-MSX trigger (ChkSwitchMsxOff). The rest below are data tables / bank wrappers /
// game-state dispatch the port already covers, or dead code.
set('player-damage-hud', 'done', ['ChkUsingArmor']);
set('finale', 'done', ['ChkSwitchMsxOff', 'ShowEmergencyText']);
set('item-pickups', 'done', ['ClearGameVars', 'SetMaxAmmo3', 'MaxAmmoVals']);   // new-game reset + INTRUDER/ISOLATION cheats
set('rank-progression', 'done', ['IncClassLv_']);                               // bank wrapper around incClassLv
set('ending-persistence', 'done', ['GameDataAreas', 'SaveStatRooms', 'GS_Ending', 'GS_Ending2']);  // checkpoint data + ending state
set('title-boot', 'done', ['GS_WaitMenu', 'GS_DemoPlay']);                       // title/demo GameState handlers
set('room-traversal', 'done', ['EntryRoomXY']);                                 // entry-position data (PLAYER_IN_DOOR_DAT/enter)
set('roof-traversal', 'done', ['InitSentinel2', 'InitSentinel3', 'SetJetpackFloorSpr']);
set('hazards', 'done', ['PowerSwitchLogic2']);
set('mid-bosses', 'done', ['loc_106472', 'loc_106499', 'loc_10649F']);          // tank code fragments (the tank moves/fires)
set('mid-bosses', 'out-of-scope', ['TankAlive']);                               // dead code (status 3 is never set)
// Documented approximations (resolved to partial, not raw todos):
set('mid-bosses', 'partial', ['TankIdle']);                  // the stop-to-fire pause: the port fires while moving
set('hazards', 'partial', ['ChkRevertFade', 'ChkRevertFade2', 'ChkRevertFade3']);  // electric-floor fade-revert visual
set('finale', 'partial', ['ChkMadnarMsx', 'chkMadnarLate', 'DestroyMetalG', 'DestroyMetalG2']);  // Madnar-moved story event + the destruction flash
set('player-weapons', 'partial', ['BinocularSprAtt']);       // the binocular scrolling-view sprite
set('bosses', 'partial', ['SGunnerRollSpr']);                // the somersault sprite-frame table (the invuln-roll behavior is ported)

// elevators — the FULL relieve ceremony is now ported (elevReliefTick): the two posted guards
// (InitGuardElevat) look around (GuardRandomDir), leave after the post timer (GuardElevIdle ->
// GuardElevatorWalk/Leave) announcing "Relieve", and a spawner (InitSpawnGuardElev/SpawnGuardElev)
// marches a fresh pair in from the right (InitGuardRelieve); a player in the corridor sounds the
// alarm (GuardElevSetAlert) turning guard 1 into a chaser and fleeing guard 2 (GuardElevFlees).
set('elevators', 'done', ['InitGuardElevat', 'InitGuardRelieve', 'GuardElevator', 'GuardElevator2',
  'GuardElevatorWalk', 'GuardReachElevator', 'GuardElevIdle', 'GuardRandomDir', 'GuardElevLeave',
  'GuardElevFlees', 'InitSpawnGuardElev', 'SpawnGuardElev']);
// GuardElevSetAlert/2 + GuardElevAlert: the alarm + transform are ported, but the 0xF-iteration
// look-at-player delay is collapsed; DrawAlertSign is the buggy VRAM "!!" icon (shown via the
// normal alert icon on the transformed chaser instead).
set('elevators', 'partial', ['GuardElevSetAlert', 'GuardElevSetAlert2', 'GuardElevAlert', 'DrawAlertSign']);

// lorry-ride — the lorry guards (guardlorry.asm, rooms 5/7) now run the full emerge/patrol/return
// cycle (lorryGuardLogic): hidden in the lorry -> walk out (set Guard1/2/3ExitedLorry) -> patrol the
// path once -> walk back in (clear the flag) -> re-arm; while out, the alarm transforms it into a
// chaser. The exit flags drive the InitGuardAlert lorry dedup (rooms 127/131/132) and are saved.
set('lorry-ride', 'done', ['InitGuardLorry', 'InitGuardLorry2', 'GuardLorryLogic', 'GuardLorryWalk',
  'ResetSpanwGuard', 'NotResetSpanwGuard', 'InitGuardLorry5', 'SetGuardExitsLorry', 'GuardLorryLogic3',
  'GuardExitingLorry', 'GuardLorryNextStat', 'GuardLorryWalkEnd', 'GuardEnterLorry', 'GuardEnterLorry2',
  'GuardEnterLorry3']);
// the lorry shooter (lorryshooter.asm, room 104): the full hide/think/show/walk-out/wait/walk-in
// pop-out shooter firing aimed ID_BULLET, with the alert MUSIC (no AlertMode) on entry.
set('lorry-ride', 'done', ['InitLorryShooter', 'LorrySetRndWait', 'LorryShooterLogic', 'LorryShooterThink',
  'LorryShooterShow', 'LorryShooterShot', 'LorryShooterWait', 'LorryShooterWalkOut', 'LorryShooterWaitOut',
  'LorryShooterWalkIn', 'LorShooterSetCol']);

// ending-persistence — the five PASSWORD cheats (typed in pause, ChkPasswords) + their effects.
set('ending-persistence', 'done', [
  'ChkCharTyped', 'ReadKeyboard', 'ReadKeyboard2', 'GetTyped', 'GetTyped2', 'GetTyped3', 'GetTyped4',
  'AddCharPassBuf', 'PassDS_4', 'PassANTA_WA', 'PassINTRUDER', 'PassISOLATION', 'PassHIRAKE',
  'ChkPassword', 'ChkPassword2', 'ChkPasswords', 'SetMaxClass', 'IncreaseClass', 'SetMaxAmmount',
  'SetMaxAmmount2', 'SetMaxRations', 'SetAllCards', 'SetAllCards2', 'AddCardToEquip',
  'AddCardToEquip2', 'AddCardToEquip3',
]);
// enemy-bullets — the straight axis bullet (bullethv.asm): InitBulletHor/Vert/Vert2 now port the
// bit7 screen-half direction + random perpendicular drift + 0x500 axis speed (fireAxisBullet),
// fired by Big Boss and the suppressor guards.
set('enemy-bullets', 'done', ['InitBulletHor', 'InitBulletVert', 'InitBulletVert2']);

// guard — the card-based reinforcement budget + faithful alarm persistence are now ported
// (setalert.asm SetAlertMode2/3/4/6: NumRespawnGuards = highest keycard owned + 3, or 0 in room
// 216; DecRespawnGuards spends it on each reinforcement kill; ChkAlarmEnd holds the alarm across
// rooms while the budget remains, and the simultaneous respawn cap is 3 red-alert / 4 otherwise).
// The broader alert-guard sub-AI (walk-away/shoot states, water avoidance, exact LOS) is still
// approximated — see the remaining guard partials/todos.
set('guard', 'done', ['SetAlertMode2', 'SetAlertMode3', 'SetAlertMode4', 'SetAlertMode6', 'ChkAlarmEnd']);
// guard — the alert-guard sub-AI now ports the RED-ALERT stand-off (guardalert.asm): ChkNearPlayer
// + GetDistancePlayer1-4 (max(|dx|,|dy|) < 0x30), SetGuardWalkAway / GuardWalkAwayShot (status 3,
// retreat-then-shoot via the shared GuardChasePlayer2), GetOppositePlayer, the RED-ALERT double-
// shot on resume (GuardWaitShot) and faster action cadence (SetGuardRndCounter base 0x0A vs 0x14).
set('guard', 'done', ['ChkNearPlayer', 'GetDistancePlayer', 'GetDistancePlayer2', 'GetDistancePlayer3',
  'GetDistancePlayer4', 'SetGuardWalkAway', 'GuardWalkAwayShot', 'GetOppositePlayer',
  'SetGuardRndCounter', 'GuardWaitShot', 'GuardWalk2']);
// guard — ChkGuardWater's EXIT avoidance (chkGuardWater/moveAwayExit): an alert guard reading tile
// 1 (door/lorry/chasm) under its feet turns 180° rather than leave. ChkGuardWater2 is partial: the
// cosmetic in-water sprite swap (BASE_SPR_ID 0x49) is omitted (no in-water guard frames exported).
set('guard', 'done', ['ChkGuardWater', 'MoveAwayExit']);
set('guard', 'partial', ['ChkGuardWater2']);
// guard — GuardWaitChkAlert (the status-4 init beat: a freshly-alerted guard heads at Snake for a
// beat, then chases and triggers SetAlertMode) + InitGuardAlert/InitGuardAlert4 (enterAlert) +
// SetRespawnTime/2/3 (the per-room reinforcement override: room 216 -> none, rooms 187/154/88-92
// -> random timer 0x10..0x1F + budget 10, others keep the card budget).
set('guard', 'done', ['GuardWaitChkAlert', 'InitGuardAlert', 'InitGuardAlert4',
  'SetRespawnTime', 'SetRespawnTime2', 'SetRespawnTime3']);
// guard / camera LOS now ports chkdiscover.asm exactly: ChkSeePlayer/ChkSeePlayer2 (deep-water +
// stationary-box gates, touch discovery), the ChkLookUp/Down/Left/Right facing tests (with the
// ROM's ret c / ret nc level-row asymmetry), the ChkViewVertical/Horizontal sight bands (|dx| < 8;
// guard |dy| < 6, camera |dy| < 4), and ChkViewObstacles' tile walk with the see-through railings
// (0x68-0x6C/0x6E, 0x8B-0x8E) in the water-channel rooms.
set('guard', 'done', ['ChkActSeePlayer', 'ChkSeePlayer', 'ChkSeePlayer2', 'ChkLookUp', 'ChkLookUp2',
  'ChkLookDown', 'ChkLookDown2', 'ChkLookLeft', 'ChkLookLeft2', 'ChkLookRight', 'ChkLookRight2',
  'ChkPosAboveUnder', 'ChkPosLeftRight', 'ChkViewObstacles', 'ChkViewObstacles2', 'ChkViewObstacles3',
  'CalcNextTileAddress', 'CalcNextTileAddress2', 'ChkViewVertical', 'ChkViewHorizontal', 'ChkViewHorizontal2']);
// guard — the noise/touch discovery (chkdiscover.asm ListenShotsChkTouch / ChkDiscoverPlayer2-6):
// sleeping guards (GuardSleeping) and sentinels (SentinelLogic) wake on a touch or the noise of an
// EXPLODING player shot (our status-2 explosion frame), gated by the silenced-handgun/SMG check.
set('guard', 'done', ['ListenShotsChkTouch', 'ChkDiscoverPlayer2', 'ChkDiscoverPlayer3',
  'ChkDiscoverPlayer4', 'ChkDiscoverPlayer5', 'ChkDiscoverPlayer6']);
// guard — the lorry-interior alert-guard dedup (InitGuardAlert2/3 + ChkDismissGuard): a guard in
// room 127/131/132 that would alert is dismissed when its lorry soldier already exited
// (Guard1/2/3ExitedLorry). The guard-side check is ported (lorryGuardExitDismiss in enterAlert);
// the flags are SET by the unported lorry-ride emerge/return system (guardlorry.asm), so they stay
// 0 for now — documented divergence, the hook is ready and unit-tested by forcing the flag.
set('guard', 'done', ['InitGuardAlert2', 'InitGuardAlert3', 'ChkDismissGuard']);

// checkpoints.asm — the full continue flow is now ported. ChkSaveGameStatus scans the 31-pair
// SaveStatRooms table on each (Room, PreviousRoom) transition (chkSaveGameStatus, armed from
// setRoom) and skips while MetalGear_KO (mgDestroyed); StoreGameStat snapshots the whole
// GameDataAreas block (serializeProgress, via takePendingCheckpoint) and RestoreGameStat rolls it
// all back on death (restart -> restoreProgress, clearing DamageDelayTimer/Poisoned). The byte
// buffer is a JS object instead of GameProgressBuffer — same effect, documented divergence.
set('ending-persistence', 'done', [
  'ChkSaveGameStatus', 'ChkSaveGameStatus2', 'ChkSaveGameStatus3', 'RestoreGameStat',
  'StoreGameStat', 'SaveGameStaus2', 'SaveGameStaus3', 'SaveGameStaus4', 'SaveGameStaus5',
]);
// saveload.asm is MSX CASSETTE-TAPE I/O (TAPOON/TAPOUT/TAPIN) — no canvas equivalent, so it moves
// to outOfScope alongside the other hardware plumbing; the progress SAVE/LOAD is reimplemented as a
// localStorage analog (serializeProgress/restoreProgress, typed SAVE/LOAD in pause) — documented divergence.
const ep = byId['ending-persistence'];
ep.files = ep.files.filter((f) => f !== 'logic/saveload.asm');
if (!m.outOfScope.files.includes('logic/saveload.asm')) m.outOfScope.files.push('logic/saveload.asm');
// prune the saveload.asm status keys left behind when the file moved out-of-scope (they now
// resolve to "unknown routine" since the file is no longer scanned).
const SAVELOAD_ROUTINES = ['LoadSaveLogic', 'EnterSaveName', 'InitSave', 'NextSaveLoadStat_',
  'SaveFilename', 'SaveFilename2', 'SaveFilename3', 'SaveError', 'SaveError2', 'SaveGameData',
  'SaveGameData2', 'NextSaveLoadStat', 'SaveChkVerify', 'SaveVerify', 'SaveVerify2', 'SaveVerify3',
  'SaveVerify4', 'SaveNotVerify', 'SaveNotVerify2', 'ExitSaveLoad', 'SaveRetry', 'VerifyError',
  'SaveRetry2', 'LoadMode', 'EnterLoadName', 'loc_11FAFB', 'LoadData', 'LoadData2', 'TapeError',
  'PrintError', 'ChkLoadRetry', 'ChkLoadRetry2', 'SearchFile', 'SearchFile2', 'TapeError_',
  'SearchFile3', 'SearchFile4', 'PrintSkipName', 'PrintFileFound', 'GetKeyTyped', 'GetKeyTyped2',
  'GetKeyTyped3', 'PrintFilename_', 'EraseCharacter', 'EraseCharacter2', 'PrintFilename',
  'PrintFilename2', 'PrintFilename3', 'InitSaveLoad', 'ResetFilename', 'ClearBuffer',
  'CalcDataChecksum', 'CalcDataChecksum2', 'txtSaveMode', 'txtLoadMode', 'txtSaving', 'txtSaveError',
  'txtVerifyError', 'txtVerifyOk', 'txtRetry', 'txtVerify', 'txtYesNo', 'txtIng', 'txtSkip',
  'txtFound', 'txtLoadError'];
if (ep.status) for (const r of SAVELOAD_ROUTINES) delete ep.status[r];

// ---- Refresh the prose notes for the modules completed this session (they described the
// pre-session state — claiming things unported that are now done). ----------------------------
const setNote = (id, note) => { byId[id].notes = note; };

setNote('guard', 'Core patrol + the FULL alert state machine + global alarm + reinforcements + ' +
  'punch-KO are ported. The alert AI (guardalert.asm) does chase (commit-then-re-aim, ~3/4 stop-' +
  'and-shoot), wait-after-shot, obstacle detour, AND the RED-ALERT stand-off (SetGuardWalkAway/' +
  'GuardWalkAwayShot statuses 3/4 via ChkNearPlayer max(|dx|,|dy|)<0x30), the RED-ALERT double-shot ' +
  'on resume + faster 0x0A cadence (SetGuardRndCounter), the status-4 init beat (GuardWaitChkAlert) ' +
  'that triggers the alarm, ChkGuardWater/MoveAwayExit (turn 180 off a door/lorry/chasm exit tile), ' +
  'and the lorry-interior dedup (InitGuardAlert2/3 + ChkDismissGuard via the Guard1/2/3ExitedLorry ' +
  'flags). LOS is now EXACT (chkdiscover.asm): the up/left-include-level facing asymmetry, the ' +
  '|dx|<8 / guard-|dy|<6 / camera-|dy|<4 sight bands, ChkViewObstacles see-through railings, and the ' +
  'noise/touch discovery (ListenShotsChkTouch/ChkDiscoverPlayer2-6 — a touch or an exploding shot ' +
  'wakes sleeping guards + sentinels). Reinforcements use the card-based budget (SetAlertMode2-4 ' +
  'NumRespawnGuards = highest card + 3; room 216 none; rooms 187/154/88-92 budget 10 via ' +
  'SetRespawnTime) spent on kills (DecRespawnGuards), with ChkAlarmEnd holding a red/camera alarm ' +
  'across rooms until the budget is spent. Documented divergences (partial): patrol pauses at every ' +
  'waypoint instead of UpdateActorPath random stop-and-wait + GuardPatrolTurn look-turn; ' +
  'ChkGuardWater2 in-water sprite omitted; the distinct RED-alert music track and the buggy ' +
  'alert-icon +8/0xBF positioning are not reproduced.');

setNote('elevators', 'The full relieve ceremony is ported (elevReliefTick): the two posted guards ' +
  '(InitGuardElevat) look around (GuardRandomDir), leave after the post timer announcing "Relieve" ' +
  '(GuardElevIdle -> Walk/Leave), and a spawner (InitSpawnGuardElev/SpawnGuardElev) marches a fresh ' +
  'pair in from the right (InitGuardRelieve); a player in the corridor (PlayerY<0x3D, ' +
  'GuardElevSetAlert/Leave) sounds the alarm — guard 1 becomes a chasing alert guard, guard 2 flees ' +
  'right (GuardElevAlert/GuardElevFlees). Partial: the 0xF-iteration look-at-player delay before the ' +
  'transform is collapsed and DrawAlertSign\'s "!!" icon shows via the normal alert icon ' +
  '(SaveAlertIconBacknd/Draw16x16 are VDP page-copy plumbing, out of scope). The elevator RIDE ' +
  '(GameMode 6 / ElevatorRoomLogic) is a verbatim port — 1px cabin+player movement, the 0x38/0x78/' +
  '0xB8 floor stops, the express-shaft hold-to-skip quirks, shaft-end chaining with 0xD0/0x18 ' +
  'parking, and held-dir-as-facing at a stop; the 12-sprite cabin is composed offline into ' +
  'elevator.png. Divergence: a shaft exit whose neighbour room isn\'t exported stops the cabin in place.');

setNote('lorry-ride', 'The moving-lorry RIDE (GameMode 5) is a verbatim port (MovingLorries arms it ' +
  'for 0x90 iterations, the VertScrollOffset wobble, the once-per-game text 91, LorryEnd). The lorry ' +
  'GUARDS (guardlorry.asm, rooms 5/7, lorryGuardLogic) run the full emerge/patrol/return cycle — ' +
  'hidden in the lorry, walk down out (setting Guard1/2/3ExitedLorry), patrol the path once, walk ' +
  'back up in (clearing the flag), re-arm; while out, the alarm transforms them into chasers. The ' +
  'room-104 lorry SHOOTERS (lorryshooter.asm, lorryShooterLogic) are the faithful HIDDEN pop-out ' +
  'ambush — think -> shoot-from-inside / show+shoot / walk-out+shoot+walk-in, aimed ID_BULLET — with ' +
  'the alert MUSIC (no AlertMode) on entry; hidden lorry actors are non-drawn and non-collidable. ' +
  'The exit flags are saved and drive the InitGuardAlert dedup (rooms 127/131/132). Divergences: the ' +
  'engine SFX loops the whole ride; SetVertScroll is the canvas shake (out of scope).');

setNote('dogs-wing', 'Room-207 surface dogs (DogLogic: sleep/listen/charge) and the Coward Duck ' +
  '(CowardDuckLogic + the elliptical boomerang + the CARD8 drop) are verbatim. The basement dogs ' +
  '(dogbasement.asm, rooms 6/10/55/56/58-63, basementDogMove) free-roam: sleep -> run (roam, ' +
  'turning at walls via the 8px probe) -> chase (re-aim on the current axis with a bark, ' +
  'ChkDogNearPlayer); a placed dog starts asleep, a spawned dog (ID_SPAWN_DOG) running. The ambush ' +
  'shooters (shooter.asm, rooms 88/90/91/206, shooterLogic) strafe sideways, fire VERTICAL bullets, ' +
  'return to the start X, and transform into an alert chaser after 3 cycles or when the player ' +
  'closes in vertically — rooms 88/90/91 set the alarm directly (timer 0x80, budget 0x0A), room 206 ' +
  'doesn\'t. Divergences (partial): the shooter\'s player-entry Y-relocation is simplified to the ' +
  'exported positions, and the dog spawner\'s cross-room NumBasementDogs carry-over is approximated ' +
  'by placed dogs.');

setNote('hazards', 'Mines (contact + detector reveal), gas clouds, rolling barrels, and the electric ' +
  'floor + power switches (ChkElectricFloor, rooms 16/40/110/116) are ported. The room-16 ' +
  'GUARD_SWITCH operator (GuardSwitchLogic: patrol/look/alarm/run-to-switch/power-the-floor/' +
  'guard-it), the room-150 SUPPRESSOR guards (GuardSilencerLogic move-then-cross-fire + ' +
  'ChkChasePlayer transform + the SUPPRESSOR drop), the per-room HideGuards entry-edge culls, and ' +
  'the sleepy-guard Zzz are all live. Divergences (partial): PowerSwitchLogic\'s palette fade is a ' +
  'translucent pulse over the live tiles (ChkRevertFade\'s bright/delta math isn\'t ported); the ' +
  'switch guard\'s exact LOS uses the box-aware guardSeesSnake.');

setNote('radio-text', 'The transceiver (RadioLogic GameMode 4) is ported: the DrawRadio UI, the red ' +
  '120.xx BCD frequency with ChgRadioFreq hold-repeat, UP=SEND (text 10 + talking portrait), the ' +
  '12-LED RadioSignalUp, ChkRadioReceiv auto-reply/wait-call from radiocalls.json with the ' +
  'AutoReplyDone/ReplyRequested latches, and RadioSignalOFF; opening the radio stops the incoming ' +
  'CALL (ChkIncomingCall lifecycle + the CALL-sign blink). The SEND reply GATES are ported ' +
  '(ChkRadioReply -> radioReplyGate): Big Boss (0x85/0x13) orders "switch off your MSX" [text 136] ' +
  'after room 111 (switchOffMsx via ChkSwitchMsxOff) and warns "you have been bugged" [text 50] when ' +
  'transmiTaken; a CAPTURED Schneider (0x79/0x26) is silent; Jennifer (0x48) needs rank class >= 3. ' +
  'The text window (TextBoxAppear/TW_PrintChar/SkipText/SetTextUnskippable) is done. Divergences ' +
  '(partial/inert): the MapZone>=5 ANTENNA gate, Jennifer\'s dead-brother gate, and the Madnar/' +
  'text-15 gate need unmodelled progression; DrawTextBoxIn\'s exact box-grow + per-page TW_Wait ' +
  'pacing are approximated.');

setNote('doors', 'The full ChkOpenDoor lock dispatch is ported: plain doors, keycards (ChkCard1-8), ' +
  'elevator doors (lock 1: type 5 up / type 6 right), the punch door (10), the lorry door (11), the ' +
  'desert/compass/Big-Boss event doors (12/13/14 via one-shot flags), the punchable prison walls ' +
  '(15: PunchWallDirs, PrisonWall1/2Life 0x28), and the lock-16 bomb/secret walls. The breakable/' +
  'secret WALLS (render types 7-19, DrawBasemWall*/DrawWall) are drawn closed from their own ' +
  'wall-N.png sprites and made solid (closedWallSolid), then opened by a bomb/punch and wiped away ' +
  '(EraseBasemWall*), revealing the room art behind — RestoreSavedTiles\' VRAM save/restore is ' +
  'replaced by the pre-rendered room PNG (documented). ChkEnterDoor is ported including the hidden ' +
  'doors 0x40/0x6C (never auto-entered), the IN-ROOM walls (dest === room; rooms 58/60/63/100/108 ' +
  'open a passage without a room reload — the 0x20 logic bit), and the MetalGear_KO door-0x62 ' +
  'lockout. Open/enter areas come from door-types.json (DoorOpenEnterDat verbatim). Divergences ' +
  '(partial): the per-wall erase WIPE is one shared directional approximation; ChkDoorLorry2 is a ' +
  'stand-in; SetDoorOpen\'s DoorOpenArray persistence is event-doors-only.');

setNote('finale', 'The hind-d gunship (room 50) and the TX-55 Metal Gear (room 118: the bomb-order ' +
  'destruction arming the self-destruct, DoorOpenArray doors 99/107, the Beyond-Big-Boss music ' +
  'takeover) are faithful, and the destruction now shows ShowEmergencyText\'s text 150 (unskippable) ' +
  '+ arms the room-111 SwitchOffMSXF (ChkSwitchMsxOff). Big Boss (bigBossTick) is the six-state ' +
  'corridor/crate AI (Think/Run/ShowUp/Shoot/Cover, bbCovered crate spots, bbTurnCorner 24/200/56/' +
  '168 corners) firing the straight axis bullet (BB_Shoot, fireAxisBullet) with the real SprBigBoss ' +
  'sprite; the confession (text 147) + death latch are faithful. The endgame countdown ' +
  '(destructiontimer.asm: DecNukeTimer, the zero-kill, ChkUseCigarettes +2000) is done. Divergences ' +
  '(partial): DestroyMetalG\'s 0x22-iteration palette-FLASH is skipped (the wreck + emergency text ' +
  'are instant); the room-133/113 "Madnar moved / too late" story events (ChkMadnarMsx/chkMadnarLate) ' +
  'and bigexplosion.asm\'s tank-shell burst actor are unported.');

setNote('player-damage-hud', byId['player-damage-hud'].notes
  .replace('Still open: ChkUsingArmor (the armor\'s bullet-damage reduction — no armor item; on SESSION-STATE\'s polish list) and ',
           'ChkUsingArmor (the bullet-proof vest, item 1, halves incoming damage) is now done. Still open: ')
  .replace('Still open: ChkTouchEnemy2', 'ChkTouchEnemy2'));

setNote('mid-bosses', byId['mid-bosses'].notes
  .replace('TankAlive and loc_106472/loc_106499/loc_10649F are unreachable ROM dead code, listed todo.',
           'TankAlive and loc_106472/loc_106499/loc_10649F are unreachable ROM dead code (out of scope / no-op). TankIdle\'s every-128-iteration idle beat is the one documented behavioural partial.'));

fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
console.log('coverage-map.json refreshed.');
