import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicalCover} from '../dist/input.js';
test('physical cover preserves native hysteresis and requires tracked calibration',()=>{
 const c=new PhysicalCover();assert.equal(c.pedal(1.7),false);c.calibrate(1.7);
 assert.equal(c.pedal(1.7),true);assert.equal(c.pedal(1.49),false);assert.equal(c.pedal(1.54),false);
 assert.equal(c.pedal(1.59),true);assert.equal(c.pedal(1.54),true);assert.equal(c.pedal(1.7,false),false);
 assert.equal(c.pedal(NaN),false);c.calibrate(1.3);assert.equal(c.pedal(1.3),true);
});
