import { cartoonize } from './processing.js';
self.onmessage = ({data:{pixels,w,h,style,strength}}) => {
  try { const result=cartoonize(pixels,w,h,style,strength); self.postMessage({pixels:result},[result.buffer]); }
  catch(e){self.postMessage({error:e.message});}
};
