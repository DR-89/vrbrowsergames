import assert from 'node:assert/strict';
import test from 'node:test';
import {multiply,rotate,relative,originFrom,viewMatrix,perspective} from '../dist/math.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('recenter preserves physical eye separation and head translation',()=>{
 const pose={transform:{position:{x:2,y:1.7,z:3},orientation:{x:0,y:Math.sin(.4),z:0,w:Math.cos(.4)}}};
 const origin=originFrom(pose);
 const a=relative({position:{x:2-.032,y:1.7,z:3},orientation:pose.transform.orientation},origin);
 const b=relative({position:{x:2+.032,y:1.7,z:3},orientation:pose.transform.orientation},origin);
 near(Math.hypot(...a.p.map((v,i)=>v-b.p[i])),.064);
 const center=relative(pose.transform,origin);center.p.forEach(v=>near(v,0));near(center.q[3],1);
 const moved=relative({position:{x:2,y:1.8,z:3},orientation:pose.transform.orientation},origin);near(moved.p[1],.1);
});
test('view matrix transforms camera position to origin',()=>{
 const p=[.2,-.1,.4],q=[0,Math.sin(.3),0,Math.cos(.3)],m=viewMatrix(p,q);
 for(let i=0;i<3;i++)near(m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]+m[12+i],0);
});
test('arcade flat projection exactly matches the original 640x480 plane',()=>{
 const p=perspective(2*Math.atan(.48),4/3);
 near(p[0]*1.6/2.5,1);near(p[5]*1.2/2.5,1);
});
test('controller quaternion operations preserve unit forward vector',()=>{
 const q=[Math.sin(.2),0,0,Math.cos(.2)];const v=rotate(q,[0,0,-1]);near(Math.hypot(...v),1);
 const unit=multiply(q,[-q[0],-q[1],-q[2],q[3]]);unit.slice(0,3).forEach(v=>near(v,0));near(unit[3],1);
});
