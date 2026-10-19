export const clamp = (v, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, v));
export function fitSize(w, h, max) {
  const scale = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
}
export function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

// Integral-image Kuwahara filter: blend surrounding quadrants by their uniformity.
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
    let total=0;const color=[0,0,0];
    for(let q=0;q<4;q++) {
      const x0=Math.max(0,x-(q%2?0:radius)),x1=Math.min(w,x+(q%2?radius:0)+1);
      const y0=Math.max(0,y-(q<2?radius:0)),y1=Math.min(h,y+(q<2?0:radius)+1);
      const n=(x1-x0)*(y1-y0),a=y0*stride+x0,b=y0*stride+x1,c=y1*stride+x0,d=y1*stride+x1;
      const mean=sums.map(t=>(t[d]-t[b]-t[c]+t[a])/n);
      const variance=Math.max(0,mean[4]-mean[3]*mean[3]);
      const weight=1/((1+variance/50)**3);total+=weight;
      for(let channel=0;channel<3;channel++)color[channel]+=mean[channel]*weight;
    }
    const p=(y*w+x)*4;
    for(let c=0;c<3;c++)out[p+c]=color[c]/total;out[p+3]=data[p+3];
  }
  return out;
}
// Small separable Gaussian keeps facial strokes continuous before edge extraction.
function blur(values,w,h) {
  const tmp=new Float32Array(values.length),out=new Float32Array(values.length),kernel=[1,4,6,4,1];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let k=-2;k<=2;k++)tmp[y*w+x]+=values[y*w+clamp(x+k,0,w-1)]*kernel[k+2]/16;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let k=-2;k<=2;k++)out[y*w+x]+=tmp[clamp(y+k,0,h-1)*w+x]*kernel[k+2]/16;
  return out;
}

export function cleanContours(gray,w,h,strength) {
  const smoothed=blur(gray,w,h),magnitude=new Float32Array(w*h),direction=new Uint8Array(w*h);
  const at=(x,y)=>smoothed[clamp(y,0,h-1)*w+clamp(x,0,w-1)];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const gx=-at(x-1,y-1)+at(x+1,y-1)-2*at(x-1,y)+2*at(x+1,y)-at(x-1,y+1)+at(x+1,y+1);
    const gy=-at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1)+at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1);
    magnitude[y*w+x]=Math.hypot(gx,gy);
    direction[y*w+x]=(Math.round(Math.atan2(gy,gx)*4/Math.PI)+4)%4;
  }
  const thin=new Float32Array(w*h),visited=new Uint8Array(w*h),out=new Float32Array(w*h);
  const offsets=[[1,0],[1,1],[0,1],[-1,1]],low=22+8*strength,high=58+20*strength;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++) {
    const i=y*w+x,m=magnitude[i],[dx,dy]=offsets[direction[i]];
    if(m>=low&&m>=magnitude[(y+dy)*w+x+dx]&&m>magnitude[(y-dy)*w+x-dx])thin[i]=m;
  }
  // Keep connected strokes supported by a strong edge; discard short texture fragments.
  const queue=new Int32Array(w*h),minLength=Math.max(3,Math.round(Math.max(w,h)/180));
  for(let seed=0;seed<thin.length;seed++) {
    if(!thin[seed]||visited[seed])continue;
    let count=1,head=0,peak=0;queue[0]=seed;visited[seed]=1;
    while(head<count){const i=queue[head++],x=i%w,y=Math.floor(i/w);peak=Math.max(peak,thin[i]);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
        const nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
        const j=ny*w+nx;if(thin[j]&&!visited[j]){visited[j]=1;queue[count++]=j;}
      }
    }
    if(peak>=high&&count>=minLength)for(let k=0;k<count;k++)out[queue[k]]=smoothstep(low,high,thin[queue[k]]);
  }
  return out;
}

export function cartoonize(data, w, h, style, strength) {
  const s=clamp(strength/100,0,1),sizeScale=Math.max(w,h)/1024;
  const radius=Math.max(1,Math.round((3+4*s)*sizeScale));
  // A fine image retains the geometry of eyes, nose, lips and eyebrows.
  const fine=paintRegions(data,w,h,Math.max(1,Math.round(2*sizeScale)));
  let painted=paintRegions(fine,w,h,radius);
  painted=paintRegions(painted,w,h,Math.max(1,Math.round(radius*.5)));
  if(style==='color')for(let p=0;p<data.length;p+=4){
    const detail=.299*fine[p]+.587*fine[p+1]+.114*fine[p+2];
    const base=.299*painted[p]+.587*painted[p+1]+.114*painted[p+2];
    const retain=.65*smoothstep(8,30,base-detail);
    for(let c=0;c<3;c++)painted[p+c]=painted[p+c]*(1-retain)+fine[p+c]*retain;
  }
  const gray=new Float32Array(w*h),paintGray=new Float32Array(w*h),out=new Uint8ClampedArray(data.length);
  for(let i=0;i<gray.length;i++) {
    gray[i]=.299*fine[i*4]+.587*fine[i*4+1]+.114*fine[i*4+2];
    paintGray[i]=.299*painted[i*4]+.587*painted[i*4+1]+.114*painted[i*4+2];
  }
  const edges=cleanContours(gray,w,h,style==='color'?s+.5:s),softPaint=blur(paintGray,w,h);
  const levels=style==='soft'?Math.round(13-4*s):style==='color'?Math.round(14-5*s):Math.round(10-4*s),step=255/(levels-1);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const i=y*w+x,p=i*4,l=paintGray[i];
    // Broad chroma weighting gives skin softer shadows across a range of skin tones.
    const cb=128-.168736*painted[p]-.331264*painted[p+1]+.5*painted[p+2];
    const cr=128+.5*painted[p]-.418688*painted[p+1]-.081312*painted[p+2];
    const skin=smoothstep(130,145,cr)*(1-smoothstep(172,185,cr))*smoothstep(72,90,cb)*(1-smoothstep(120,137,cb));
    let edge=edges[i];
    // Subpixel coverage softens thin strokes instead of expanding every feature.
    for(const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]])edge=Math.max(edge,edges[clamp(y+dy,0,h-1)*w+clamp(x+dx,0,w-1)]*.22);
    const ink=edge*(style==='soft'?.40:style==='color'?.52+.12*s:.88);
    const base=l*(1-.7*skin)+softPaint[i]*.7*skin;
    const light=clamp((base-128)*1.04+137);
    // Smooth transitions between flat tones remove hard contour bands on cheeks.
    const position=light/step,level=Math.floor(position);
    const quant=(level+smoothstep(.32,.68,position-level))*step;
    const natural=style==='color'?.20+.55*skin:.32*skin;
    const tone=quant*(1-natural)+light*natural;
    for(let c=0;c<3;c++) {
      let v;
      if(style==='ink')v=light<65?55:light<125?190:248;
      else {
        const chroma=(painted[p+c]-l)*(style==='soft'?1.02:style==='color'?1.10-.08*skin:1.14-.1*skin);
        v=clamp(tone+chroma+(style==='soft'?7:0));
      }
      const line=style==='ink'?25:[47,37,40][c];
      out[p+c]=v*(1-ink)+line*ink;
    }
    out[p+3]=data[p+3];
  }
  return out;
}
