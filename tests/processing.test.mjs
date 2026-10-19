import test from 'node:test';
import assert from 'node:assert/strict';
import {fitSize, smoothstep, cartoonize, cleanContours} from '../src/processing.js';
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
 assert.ok(tones.size<128,`expected broad color blocks, got ${tones.size} tones`);
});

test('contours discard flat shading and preserve a strong feature at its original position',()=>{
 const w=64,h=64,gray=new Float32Array(w*h).fill(180);
 assert.ok(cleanContours(gray,w,h,.8).every(v=>v===0));
 for(let y=24;y<32;y++)for(let x=16;x<48;x++)gray[y*w+x]=30;
 const edges=cleanContours(gray,w,h,.8);let count=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(edges[y*w+x]){count++;assert.ok(x>=14&&x<=49&&y>=22&&y<=33);}
 assert.ok(count>40,'strong feature should retain a connected outline');
});

test('approved ink and soft rendering stays unchanged',async()=>{
 const {createHash}=await import('node:crypto');
 const pixels=Uint8ClampedArray.from({length:32*32*4},(_,i)=>i%4===3?255:(i*37+i%17*11)%256);
 const hashes={ink:'e32d78f2c9cbc7ef8b34e12f81c3801d8583bb634e3fdda6bfebf74d8980715c',soft:'56da29bfc884aa241bad8d00658976eafcf372279ba3b1c1199191bcdd8e469d'};
 for(const style of ['ink','soft'])assert.equal(createHash('sha256').update(cartoonize(pixels,32,32,style,80)).digest('hex'),hashes[style]);
});
