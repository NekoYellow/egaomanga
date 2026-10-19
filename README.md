# 漫画风格迁移应用

使用 MobileNetV3 的人像漫画应用。上传或拍摄正面、睁眼、微笑的人像，选择画风，一键生成透明背景漫画。

## 运行

Node.js 22.12+：

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

打开 http://127.0.0.1:5173 ，点击“试用示例人像”即可体验。

```sh
npm test
npm run build
```

将 `dist/` 部署到 HTTPS 静态服务根路径，即可在手机浏览器上传、拍照和保存漫画。

## 算法架构

唯一 CNN 为 **MobileNetV3**，使用 MediaPipe Selfie Segmenter 预训练权重，文件约 244 KB，浏览器通过 MediaPipe Tasks Vision WASM 执行。MobileNetV3 负责人物分割，后处理负责绘制漫画风格。

流程：

1. **预处理**：读取图片并等比例缩至长边 1024 px，保留原始构图。建议输入清晰、睁眼且微笑的人像。
2. **人物分割**：MobileNetV3 输出人物置信度图。
3. **色块归并**：细尺度平滑后进行两遍 Kuwahara 色块平滑，按四个邻域的亮度方差加权混合，使皮肤、头发、衣服形成连续色块；积分图将每个邻域统计变为常数时间。
4. **分层上色**：亮度量化形成赛璐璐明暗层次，保留色度并增强饱和度；默认强度 80%。
5. **五官与线条**：用细尺度平滑图保留眼、鼻、唇的原始位置；Gaussian + Sobel 梯度、非极大值抑制和强弱边缘连通筛选生成细线，过滤短小纹理。肤色色度加权柔化面部明暗，减少脸颊上的硬色阶。
6. **透明合成**：三次 Hermite smoothstep 平滑分割蒙版，缩放后作为 alpha 合成。
7. **高清导出**：保持比例，以高质量插值输出长边 1024 / 1536 / 2048 px PNG。

两种画风：彩色漫画采用原柔和插画的色阶与柔化线条，作为默认画风；黑白墨线采用黑白灰三阶和黑色线条。界面分别以“彩”和“线”标识，点击后自动生成对应效果。

图像处理运行在 Web Worker 中。照片、模型推理及合成均在设备本地进行。拍照界面提供睁眼微笑提示，点击抓拍保存当前画面。

## 代码

- `src/main.js`：上传、拍照、MobileNetV3 推理、合成与导出。
- `src/processing.js`：尺寸处理、Kuwahara、分层色彩、描边和蒙版曲线。
- `src/worker.js`：后台漫画渲染。
- `public/models/selfie_segmenter.tflite`：应用使用的唯一模型。
- `reference-models/`：旧版人脸检测权重存档，独立于应用发布目录。
- `tests/processing.test.mjs`：尺寸、蒙版、色阶压缩及透明度测试。

## 手机与 OpenVINO 扩展

当前浏览器使用 WASM。后续原生 Android 版本可复用同一 MobileNetV3 权重与处理流程，比较 MediaPipe 与 OpenVINO Android CPU 推理耗时、内存和功耗；在 Intel 设备上转换模型、验证张量布局与精度，再进行 FP16/INT8 优化。INT8 使用代表性人像校准，并比较人物边缘质量。

## 参考

- [MobileNetV3 Selfie Segmentation](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/selfie_segmentation.md)
- [OpenVINO Android 构建](https://github.com/openvinotoolkit/openvino/blob/master/docs/dev/build_android.md)
- [示例人像来源：Google MediaPipe](https://storage.googleapis.com/mediapipe-assets/portrait.jpg)

## 面部效果优化

色块平滑按邻域方差加权混合，柔化脸颊和额头上的块状接缝。五官线条使用细尺度图像：Gaussian 平滑、Sobel 梯度、非极大值抑制和边缘连通筛选，保留强轮廓并去除短小纹理。肤色色度权重控制阴影过渡，保持眼、鼻、唇的原始位置与比例。
