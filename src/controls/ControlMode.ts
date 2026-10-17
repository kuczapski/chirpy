import { clamp, FIELD, type ControlMode } from '../config/GameConfig';
import type { Position } from './VoiceMapper';

/** Only the untrained axis is automatic. Signal validity is never bypassed. */
export function alignToTarget(position: Position, target: { x: number; y: number }, mode: ControlMode): Position {
  if (mode === 'pitch') return { ...position, x: target.x, nx: clamp((target.x - FIELD.left) / (FIELD.right - FIELD.left)) };
  if (mode === 'loudness') return { ...position, y: target.y, ny: clamp((FIELD.bottom - target.y) / (FIELD.bottom - FIELD.top)) };
  return position;
}
