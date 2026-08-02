# 魔法画笔

一个纯前端手势作画项目。摄像头识别食指，食指作为画笔；支持普通画笔、特效画笔和橡皮擦。

## 运行

```bash
npm start
```

然后打开 <http://localhost:4173>。

推荐使用 Chrome 或 Edge，因为手势识别依赖浏览器端的 MediaPipe 模型。

## 使用方式

1. 点击“开启摄像头”并允许摄像头权限。
2. 等待手势识别加载完成。
3. 点击“校准食指”，把食指放在画面中央圆圈内完成校准。
4. 选择“普通画笔”“特效画笔”或“橡皮擦”；特效画笔可继续选择火焰、清水、星光、闪电，会留下发光痕迹并播放对应粒子特效。
5. 选择颜色并通过滑块调整笔画粗细；橡皮擦按最大范围清除。
6. 点击“开始作画”后，伸出食指移动即可作画。
7. 点击“暂停作画”可以暂停，点击“清空画布”可以清除当前画面。
8. 点击“截图”可以合成当前摄像头、画布和特效；点击“保存图片”可下载 PNG。

## 手机端测试

服务器会同时启动：

- HTTP：`http://<电脑局域网IP>:4173`
- HTTPS：`https://<电脑局域网IP>:4174`

手机需要与电脑连接同一个 Wi-Fi。手机浏览器只有在 HTTPS 或 `localhost` 下才允许调用摄像头，因此推荐使用 HTTPS。

已生成证书：

- 手机安装 CA：`certs/wand-dev-ca.cer`
- 服务器私钥/证书：`certs/wand-server.pfx`

iPhone/iPad：把 `wand-dev-ca.cer` 发到手机并安装描述文件，然后到“设置 > 通用 > 关于本机 > 证书信任设置”中开启完全信任。之后访问 `https://<电脑局域网IP>:4174`。

Android Chrome：可以把 `wand-dev-ca.cer` 安装为 CA 证书；也可以使用 Chrome 标志把 HTTP 地址临时视为安全源：

1. 打开 `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. 输入 `http://<电脑局域网IP>:4173`
3. 选择 Enabled 并重启 Chrome
4. 打开 `http://<电脑局域网IP>:4173`

如果手机无法连接，请检查 Windows 防火墙是否允许 Node.js 在局域网内访问 4173/4174 端口。

## Vercel 部署

这个项目也可以作为纯静态站点部署到 Vercel。Vercel 只会托管 `index.html`、`app.js`、`styles.css`，不会运行本地 `server.js`；HTTPS 由 Vercel 自动提供。

在 Vercel 中导入该 GitHub 仓库即可。仓库已包含 `vercel.json`，部署后直接访问 Vercel 生成的 HTTPS 地址。

## 实现说明

- `app.js`：摄像头画面处理、MediaPipe 手势识别、食指校准、平滑轨迹、普通/特效画笔、橡皮擦、粒子特效。
- `server.js`：使用 Node.js 内置模块提供本地静态服务器。
- 不再包含咒语、语音识别、颜色校准和光束特效。
