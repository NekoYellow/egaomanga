export const clamp = (v, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, v));
export function fitSize(w, h, max) {
  const scale = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
}
export function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

// Integral-image Kuwahara filter: choose the most uniform surrounding quadrant.
// This merges photographic textures into broad painted regions in O(width*height).
function paintRegions(data, w, h, radius) {
  const stride=w+1, size=stride*(h+1);
  const sums=Array.from({length:5},()=>new Float64Array(size));
  for(let y=1;y<=h;y++) {
    const row=[0,0,0,0,0];
    for(let x=1;x<=w;x++) {
      const p=((y-1)*w+x-1)*4, l=.299*data[p]+.587*data[p+1]+.114*data[p+2];
      const values=[data[p],data[p+1],data[p+2],l,l*l];
      for(let c=0;c<5;c++){row[c]+=values[c];sums[c][y*stride+x]=sums[c][(y-1)*stride+x]+row[c];}
    }
  }
  const out=new Uint8ClampedArray(data.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    let best=Infinity, color=[0,0,0];
    for(let q=0;q<4;q++) {
      const x0=Math.max(0,x-(q%2?0:radius)),x1=Math.min(w,x+(q%2?radius:0)+1);
      const y0=Math.max(0,y-(q<2?radius:0)),y1=Math.min(h,y+(q<2?0:radius)+1);
      const n=(x1-x0)*(y1-y0),a=y0*stride+x0,b=y0*stride+x1,c=y1*stride+x0,d=y1*stride+x1;
      const mean=sums.map(t=>(t[d]-t[b]-t[c]+t[a])/n);
      const variance=Math.max(0,mean[4]-mean[3]*mean[3]);
      if(variance<best){best=variance;color=mean;}
    }
    const p=(y*w+x)*4;
    for(let c=0;c<3;c++)out[p+c]=color[c];out[p+3]=data[p+3];
  }
  return out;
}
export function cartoonize(data, w, h, style, strength) {
  const s=clamp(strength/100,0,1), sizeScale=Math.max(w,h)/1024;
  const radius=Math.max(1,Math.round((3+5*s)*sizeScale));
  let filtered=paintRegions(data,w,h,radius);
  filtered=paintRegions(filtered,w,h,Math.max(1,Math.round(radius*.55)));
  const gray=new Float32Array(w*h),edges=new Float32Array(w*h),out=new Uint8ClampedArray(data.length);
  for(let i=0;i<gray.length;i++)gray[i]=.299*filtered[i*4]+.587*filtered[i*4+1]+.114*filtered[i*4+2];
  const at=(x,y)=>gray[clamp(y,0,h-1)*w+clamp(x,0,w-1)];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const gx=-at(x-1,y-1)+at(x+1,y-1)-2*at(x-1,y)+2*at(x+1,y)-at(x-1,y+1)+at(x+1,y+1);
    const gy=-at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1)+at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1);
    edges[y*w+x]=smoothstep(48-16*s,115-25*s,Math.hypot(gx,gy));
  }
  const levels=style==='soft'?Math.round(12-5*s):Math.round(10-5*s),step=255/(levels-1);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const i=y*w+x,p=i*4,l=gray[i];
    // Slightly thicken major contours; softened image prevents pores becoming ink.
    let edge=edges[i];
    if(style!=='soft')for(const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]])edge=Math.max(edge,edges[clamp(y+dy,0,h-1)*w+clamp(x+dx,0,w-1)]*.65*s);
    const ink=edge*(style==='soft'?.32:.9)*(0.65+.35*s);
    const light=clamp((l-115)*1.12+134),tone=Math.round(light/step)*step;
    for(let c=0;c<3;c++) {
      let v;
      if(style==='ink')v=light<52?38:light<116?162:246;
      else {
        const chroma=(filtered[p+c]-l)*(style==='soft'?1.05:1.3);
        v=clamp(tone+chroma+(style==='soft'?12:0));
      }
      const line=style==='ink'?20:[38,32,43][c];
      out[p+c]=v*(1-ink)+line*ink;
    }
    out[p+3]=data[p+3];
  }
  return out;
}
