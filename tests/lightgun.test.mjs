import test from 'node:test';
import assert from 'node:assert/strict';
import {ScreenGunInput,screenPoint} from '../dist/input.js';
const point=(x=.5,y=.5,inside=true)=>({x,y,inside});
const gun=()=>{const g=new ScreenGunInput();g.mode='lightgun';g.move(point());return g;};

test('absolute aim accounts for side bars, scroll position and CSS size',()=>{
 const rect={left:100,top:250,width:1200,height:600};
 assert.deepEqual(screenPoint(300,250,rect),point(0,0));
 assert.deepEqual(screenPoint(700,550,rect),point());
 assert.deepEqual(screenPoint(1100,850,rect),point(1,1));
 assert.equal(screenPoint(250,550,rect).inside,false);
 assert.equal(screenPoint(1150,550,rect).inside,false);
});
test('portrait fullscreen excludes top and bottom bars',()=>{
 const rect={left:0,top:0,width:400,height:800};
 assert.deepEqual(screenPoint(200,250,rect),point(.5,0));
 assert.deepEqual(screenPoint(200,550,rect),point(.5,1));
 assert.equal(screenPoint(200,200,rect).inside,false);
 assert.equal(screenPoint(200,600,rect).inside,false);
 assert.equal(screenPoint(0,0,{left:0,top:0,width:0,height:0}).inside,false);
});
test('a sub-frame trigger pulse retains its shot position after movement',()=>{
 const g=gun();g.move(point(.2,.7));g.down(0);g.up(0);g.move(point(.8,.1));
 assert.deepEqual(g.sample(),{firing:true,pedal:true,point:point(.2,.7)});
 assert.deepEqual(g.sample(),{firing:false,pedal:true,point:point(.8,.1)});
});
test('releasing and repressing produces a fresh edge, held Crisis Zone fire continues',()=>{
 const g=gun();g.down(0);assert.equal(g.sample().firing,true);assert.equal(g.sample().firing,true);
 g.up(0);g.move(point(.1,.9));g.down(0);assert.equal(g.sample().firing,false);
 assert.deepEqual(g.sample(),{firing:true,pedal:true,point:point(.1,.9)});
});
test('reload mode hides on right button, Space or outside the game',()=>{
 const g=gun();assert.equal(g.sample().pedal,true);g.down(2);g.down(0);
 assert.deepEqual(g.sample(),{firing:false,pedal:false,point:point()});
 g.up(0);g.up(2);assert.equal(g.sample().pedal,true);assert.equal(g.sample(false,true).pedal,false);
 g.move(point(0,.5,false));g.down(0);assert.equal(g.sample().pedal,false);assert.equal(g.sample().firing,false);
});
test('pedal mode and middle button work without changing ordinary mouse controls',()=>{
 const g=gun();g.coverMode='pedal';g.coverButton=1;
 assert.equal(g.sample().pedal,false);g.down(2);assert.equal(g.sample().pedal,false);
 g.down(1);assert.equal(g.sample().pedal,true);g.up(1);assert.equal(g.sample().pedal,false);
 assert.equal(g.sample(false,true).pedal,true);
 const m=new ScreenGunInput();m.move(point());assert.equal(m.sample().pedal,false);m.down(2);assert.equal(m.sample().pedal,true);
});
test('focus loss, cancellation and resize clear queued shots and held buttons',()=>{
 const g=gun();g.down(0);g.down(2);g.reset();const s=g.sample();
 assert.equal(s.firing,false);assert.equal(s.pedal,false);assert.equal(s.point.inside,false);
 g.move(point());assert.equal(g.sample().firing,false);
});
