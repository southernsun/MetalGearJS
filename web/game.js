const tickCounter = getTickCounter();
const alertSm = alertSM;
const sentinel = sentinel;
const respawn = respawn;
const guardAwakeTimer = guardAwakeTimer;
const guardSleepingTime = guardSleepingTime;
const lookPauseWaitTimer = lookPauseWaitTimer;

guardAwakeTimer -= tickCounter & 1;
guardSleepingTime += tickCounter & 1;
lookPauseWaitTimer -= tickCounter & 1;