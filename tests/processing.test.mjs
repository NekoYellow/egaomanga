import test from 'node:test';
import assert from 'node:assert/strict';
import {fitSize, smoothstep, cartoonize} from '../src/processing.js';
test('aspect ratio and no pre-processing upscaling',()=>{assert.deepEqual(fitSize(4000,2000,1024),[1024,512]);assert.deepEqual(fitSize(100,200,1024),[100,200]);});
test('mask has transparent and opaque regions with smooth transitions',()=>{assert.equal(smoothstep(.2,.8,0),0);assert.equal(smoothstep(.2,.8,1),1);assert.ok(Math.abs(smoothstep(.2,.8,.5)-.5)<1e-6);});
test('all styles preserve alpha, dimensions and ink has neutral RGB',()=>{
 const pixels=new Uint8ClampedArray([255,0,0,0,0,255,0,120,0,0,255,255,220,180,140,255]);
 for(const style of ['color','ink','soft']){const out=cartoonize(pixels,2,2,style,65);assert.equal(out.length,pixels.length);for(let p=0;p<16;p+=4){assert.equal(out[p+3],pixels[p+3]);if(style==='ink'){assert.equal(out[p],out[p+1]);assert.equal(out[p+1],out[p+2]);}}}
});

test('comic rendering reduces a photographic gray ramp into discrete tones',()=>{
 const data=new Uint8ClampedArray(256*4);for(let x=0;x<256;x++){data.set([x,x,x,255],x*4);}
 const result=cartoonize(data,256,1,'color',80);
 const tones=new Set();for(let i=0;i<result.length;i+=4)tones.add(result[i]);
 assert.ok(tones.size<20,`expected broad color blocks, got ${tones.size} tones`);
});
