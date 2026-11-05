import { describe, expect, it } from 'vitest';
import { Player, type PlayerState } from '../src/player.js';

function makePlayer(options: { fps?: number; duration?: number; loop?: boolean } = {}) {
  const states: PlayerState[] = [];
  const player = new Player({
    fps: options.fps ?? 30,
    duration: options.duration ?? 2,
    ...(options.loop === undefined ? {} : { loop: options.loop }),
    onChange: (s) => states.push(s),
  });
  return { player, states };
}

describe('Player', () => {
  it('starts paused at frame 0', () => {
    const { player } = makePlayer();
    expect(player.state).toMatchObject({ frame: 0, frameCount: 60, t: 0, playing: false });
  });

  it('advances by elapsed wall time, quantised to whole frames', () => {
    const { player } = makePlayer();
    player.play(1000);
    player.tick(1000 + 1000 / 30 - 1);
    expect(player.state.frame).toBe(0);
    player.tick(1000 + 1000 / 30);
    expect(player.state.frame).toBe(1);
    player.tick(1500);
    expect(player.state.frame).toBe(15);
    expect(player.state.t).toBe(0.5);
  });

  it('loops by default', () => {
    const { player } = makePlayer();
    player.play(0);
    player.tick(2100);
    expect(player.state.frame).toBe(3);
    expect(player.state.playing).toBe(true);
  });

  it('stops on the last frame when not looping', () => {
    const { player } = makePlayer({ loop: false });
    player.play(0);
    player.tick(5000);
    expect(player.state).toMatchObject({ frame: 59, playing: false });
    player.play(6000);
    expect(player.state.frame).toBe(0);
  });

  it('steps and seeks within bounds', () => {
    const { player } = makePlayer();
    player.step(-1);
    expect(player.state.frame).toBe(0);
    player.step(5);
    expect(player.state.frame).toBe(5);
    player.seek(1000);
    expect(player.state.frame).toBe(59);
  });

  it('keeps advancing from a seek made while playing', () => {
    const { player } = makePlayer();
    player.play(0);
    player.seek(30, 100);
    player.tick(100 + 500);
    expect(player.state.frame).toBe(45);
  });

  it('keeps the current time when the fps changes', () => {
    const { player } = makePlayer();
    player.seek(15); // 0.5 s at 30 fps
    player.configure({ fps: 60 });
    expect(player.state).toMatchObject({ frame: 30, frameCount: 120, t: 0.5 });
  });

  it('does not emit when nothing changed', () => {
    const { player, states } = makePlayer();
    player.seek(0);
    player.tick(1000);
    expect(states).toHaveLength(0);
  });
});
