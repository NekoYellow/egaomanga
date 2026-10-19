import './style.css';
import {FilesetResolver, ImageSegmenter} from '@mediapipe/tasks-vision';
import {fitSize, smoothstep} from './processing.js';
const $=id=>document.getElementById(id);
let source, sourceURL, style='color', busy=false, segmenter, runtime, stream, revision=0;
const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
const status=t=>{$('status').textContent=t;};
const tick=()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
async function models(needsSegmentation){
  runtime ??= await FilesetResolver.forVisionTasks('/wasm');
  if(needsSegmentation) segmenter ??= await ImageSegmenter.createFromOptions(runtime,{baseOptions:{modelAssetPath:'/models/selfie_segmenter.tflite',delegate:'CPU'},runningMode:'IMAGE',outputConfidenceMasks:true,outputCategoryMask:false});
}
function resetResult(){ $('output').hidden=true;$('compare-image').hidden=true;$('empty').hidden=false;$('download').disabled=true;$('compare').disabled=true;$('result-badge').textContent='等待生成'; }
async function loadFile(file){
  if(busy||!file)return;
  const token=++revision;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))return status('请选择 JPG、PNG 或 WEBP 图片');
  if(file.size>20*1024*1024)return status('图片超过 20 MB，请压缩后重试');
  const url=URL.createObjectURL(file), img=new Image();
  try{
    img.src=url;await img.decode();if(token!==revision){URL.revokeObjectURL(url);return;}
    if(img.naturalWidth*img.naturalHeight>40000000)throw new Error('图片超过 4000 万像素，请缩小后重试');
    if(sourceURL)URL.revokeObjectURL(sourceURL);sourceURL=url;source=img;
    $('source-preview').src=url;$('source-preview').hidden=false;$('upload-copy').hidden=true;$('compare-image').src=url;
    resetResult();$('generate').disabled=false;
    status(Math.min(img.naturalWidth,img.naturalHeight)<512?'图片分辨率偏低，建议使用短边至少 512 px 的照片':'照片已就绪，点击生成你的漫画头像');
  }catch(e){URL.revokeObjectURL(url);status(e.message||'图片读取失败');}
}
$('file').onchange=e=>{loadFile(e.target.files[0]);e.target.value='';};
$('drop').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file').click();}};
for(const type of ['dragover','dragleave','drop'])$('drop').addEventListener(type,e=>{e.preventDefault();$('drop').classList.toggle('drag',type==='dragover');if(type==='drop')loadFile(e.dataTransfer.files[0]);});
document.querySelectorAll('.style').forEach(b=>b.onclick=()=>{style=b.dataset.style;document.querySelectorAll('.style').forEach(x=>x.classList.toggle('active',x===b));if(source)status('画风已调整，重新生成后生效');});
$('strength').oninput=()=>{$('strength-value').textContent=$('strength').value+'%';};
function lock(value){busy=value;document.querySelectorAll('aside button, aside input, aside select').forEach(e=>e.disabled=value);$('generate').disabled=value||!source;$('download').disabled=value||$('output').hidden;$('compare').disabled=value||$('output').hidden;}
async function generate(){
  if(!source||busy)return;
  $('compare-image').hidden=true;if($('empty').hidden)$('output').hidden=false;$('compare').textContent='查看原图';lock(true);$('working').hidden=false;const start=performance.now();
  try{
    $('progress').textContent='加载 MobileNetV3 画笔…';await tick();await models($('remove').checked);
    const [w,h]=fitSize(source.naturalWidth,source.naturalHeight,1024), input=canvas(w,h),ctx=input.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,w,h);
    let maskCanvas;
    if($('remove').checked){
      $('progress').textContent='MobileNetV3 正在分离人物…';await tick();
      segmenter.segment(input,result=>{
        const mask=result.confidenceMasks?.[0];if(!mask)throw new Error('分割模型没有返回人物蒙版');
        const values=mask.getAsFloat32Array();maskCanvas=canvas(mask.width,mask.height);
        const mctx=maskCanvas.getContext('2d'),image=mctx.createImageData(mask.width,mask.height);
        for(let i=0;i<values.length;i++){image.data[i*4]=255;image.data[i*4+1]=255;image.data[i*4+2]=255;image.data[i*4+3]=Math.round(255*smoothstep(.2,.8,values[i]));}mctx.putImageData(image,0,0);
      });
    }
    $('progress').textContent='归并色块、绘制赛璐璐阴影与墨线…';await tick();
    const pixels=ctx.getImageData(0,0,w,h).data;
    const output=await new Promise((resolve,reject)=>{worker.onmessage=e=>e.data.error?reject(new Error(e.data.error)):resolve(e.data.pixels);worker.onerror=()=>reject(new Error('图像处理失败，请刷新页面重试'));worker.postMessage({pixels,w,h,style,strength:Number($('strength').value)},[pixels.buffer]);});
    ctx.putImageData(new ImageData(output,w,h),0,0);
    if(maskCanvas){ctx.globalCompositeOperation='destination-in';ctx.drawImage(maskCanvas,0,0,w,h);ctx.globalCompositeOperation='source-over';}
    const max=Number($('resolution').value),scale=max/Math.max(w,h),out=$('output');out.width=Math.round(w*scale);out.height=Math.round(h*scale);
    const octx=out.getContext('2d');octx.imageSmoothingEnabled=true;octx.imageSmoothingQuality='high';octx.drawImage(input,0,0,out.width,out.height);
    $('empty').hidden=true;out.hidden=false;$('compare-image').hidden=true;$('compare').textContent='查看原图';$('result-badge').textContent='创作完成';
    status(`${out.width} × ${out.height} · ${((performance.now()-start)/1000).toFixed(1)} 秒 · ${maskCanvas?'透明背景':'保留背景'} · 高清插值导出`);
  }catch(e){status(e.message||'生成失败，请重试');}finally{$('working').hidden=true;lock(false);}
}
$('generate').onclick=generate;
$('compare').onclick=()=>{const show=$('compare-image').hidden;$('compare-image').hidden=!show;$('output').hidden=show;$('compare').textContent=show?'返回漫画':'查看原图';};
$('download').onclick=()=>{$('output').toBlob(blob=>{if(!blob)return status('导出失败，请重试');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`egao-${Date.now()}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);},'image/png');};
function stopCamera(){stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;}
$('camera-dialog').addEventListener('close',stopCamera);$('close-camera').onclick=()=>$('camera-dialog').close();
$('camera').onclick=async()=>{
  $('camera-dialog').showModal();$('camera-status').textContent='正在请求摄像头权限…';$('capture').disabled=true;
  try{if(!navigator.mediaDevices)throw new Error('摄像头需要 HTTPS 或 localhost');stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1920},height:{ideal:1080}},audio:false});if(!$('camera-dialog').open){stopCamera();return;}$('video').srcObject=stream;await $('video').play();$('capture').disabled=false;$('camera-status').textContent='请正对镜头，睁眼并微笑';}catch(e){stopCamera();$('camera-status').textContent='无法打开摄像头：'+e.message;}
};
$('capture').onclick=async()=>{
  $('capture').disabled=true;
  try{const v=$('video');if(!v.videoWidth)throw new Error('摄像头尚未就绪');const c=canvas(v.videoWidth,v.videoHeight);c.getContext('2d').drawImage(v,0,0);const blob=await new Promise(r=>c.toBlob(r,'image/png'));await loadFile(new File([blob],'camera.png',{type:'image/png'}));$('camera-dialog').close();}catch(e){$('camera-status').textContent=e.message;}finally{$('capture').disabled=false;}
};
window.addEventListener('pagehide',stopCamera);

$('example').onclick=async()=>{try{const r=await fetch('/examples/portrait.jpg');if(!r.ok)throw new Error('示例加载失败');await loadFile(new File([await r.blob()],'example.jpg',{type:'image/jpeg'}));}catch(e){status(e.message);}};
