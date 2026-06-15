export const PLAYER_MOVE_SPEED = 45;
export const PLAYER_MAX_STEP_HEIGHT = 0.9;
export const PLAYER_GRAVITY = 170;
export const PLAYER_JUMP_POWER = 65;
export const PLAYER_MAX_AIR_JUMPS = 1;
export const PLAYER_MAX_DASHES = 2;
export const PLAYER_DASH_SPEED = 700;
export const PLAYER_DASH_DURATION = 0.05;
export const PLAYER_DASH_RECHARGE_TIME = 0.6;

export const PLAYER_WALLRUN_SPEED = PLAYER_MOVE_SPEED * 1.25;
export const PLAYER_WALLRUN_GRAVITY_SCALE = 0.35;
export const PLAYER_WALLRUN_MAX_TIME = 100;
export const PLAYER_WALLRUN_COOLDOWN = 0.2;
export const PLAYER_WALLRUN_MIN_HEIGHT = 0.7;
export const PLAYER_WALLRUN_DETECT_DISTANCE = 1.2;
export const PLAYER_WALLRUN_STICK_FORCE = 14;
export const PLAYER_WALLRUN_JUMP_UP = 58;
export const PLAYER_WALLRUN_JUMP_PUSH = 22;
export const PLAYER_WALLRUN_MIN_WALL_ANGLE_DEG = 65;
export const PLAYER_WALLRUN_MAX_WALL_ANGLE_DEG = 105;
export const PLAYER_WALLRUN_NO_GRAVITY_TIME = 2;
export const PLAYER_WALLRUN_CAMERA_ROLL_DEG = 12;
export const PLAYER_WALLRUN_CAMERA_ROLL_SPEED = 12;
export const PLAYER_WALLRUN_CAMERA_OFFSET = 0.35;

export const PLAYER_SLIDE_SPEED = PLAYER_MOVE_SPEED * 1.6;
export const PLAYER_SLIDE_DURATION = 0.65;
export const PLAYER_SLIDE_FRICTION = 3.5;
// Camera feel while sliding: larger drop = stronger crouch sensation.
export const PLAYER_SLIDE_CAMERA_DROP = 1.5;
export const PLAYER_SLIDE_CAMERA_PULLBACK = 0.42;
// Slightly faster blending so slide camera settles sooner.
export const PLAYER_SLIDE_CAMERA_LERP_SPEED = 12;

