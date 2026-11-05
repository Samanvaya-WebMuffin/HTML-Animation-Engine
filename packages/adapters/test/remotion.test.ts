import { defineComposition } from '@html-animation-engine/core';
import { describe, expect, it } from 'vitest';
import { fromRemotion, remotionCompositionProps } from '../src/remotion.js';

const composition = defineComposition({
  id: 'demo',
  width: 640,
  height: 360,
  fps: 24,
  duration: 2.5,
  background: '#000',
  render: () => undefined,
});

describe('remotionCompositionProps', () => {
  it('gives the props a Remotion <Composition> needs', () => {
    const props = remotionCompositionProps(composition);
    expect(props).toMatchObject({
      id: 'demo',
      durationInFrames: 60,
      fps: 24,
      width: 640,
      height: 360,
    });
    expect(typeof props.component).toBe('function');
  });
});

describe('fromRemotion', () => {
  it('describes the Remotion component as an engine composition', () => {
    const wrapped = fromRemotion({
      id: 'from-remotion',
      component: () => null,
      width: 1920,
      height: 1080,
      fps: 30,
      durationInFrames: 90,
    });
    expect(wrapped).toMatchObject({
      id: 'from-remotion',
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 3,
    });
    expect(wrapped.background).toBe('transparent');
  });

  it('rejects ids the engine cannot use', () => {
    expect(() =>
      fromRemotion({
        id: 'Bad Id',
        component: () => null,
        width: 1,
        height: 1,
        fps: 1,
        durationInFrames: 1,
      }),
    ).toThrow();
  });
});
