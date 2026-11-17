import test from 'node:test';
import assert from 'node:assert/strict';
import {TriggerLatch} from '../dist/input.js';
test('a quick repress between arcade ticks still produces a new shot edge',()=>{
 const t=new TriggerLatch();t.observe(true);assert.equal(t.tick(true),true);
 t.observe(false);t.observe(true);assert.equal(t.tick(true),false);assert.equal(t.tick(true),true);
});
test('a tap entirely between ticks is retained',()=>{
 const t=new TriggerLatch();t.press();t.observe(false);assert.equal(t.tick(false),true);assert.equal(t.tick(false),false);
});
test('held automatic fire stays continuous; handoff creates a fresh edge',()=>{
 const t=new TriggerLatch();t.observe(true);assert.equal(t.tick(true),true);t.observe(true);assert.equal(t.tick(true),true);
 t.observe(true,true);assert.equal(t.tick(true),false);assert.equal(t.tick(true),true);
});
test('pause forces release before resuming a held trigger',()=>{
 const t=new TriggerLatch();t.observe(true);t.tick(true);t.reset();t.observe(true);assert.equal(t.tick(true),false);assert.equal(t.tick(true),true);
});
