# 霍格沃茨魔杖施法台

一个零依赖的可运行前端项目。浏览器请求摄像头与麦克风权限，通过彩色魔杖尖端校准来跟踪魔杖位置，并支持中文语音咒语或手动点击触发对应魔法特效。

## 运行

```bash
npm start
```

然后打开 <http://localhost:4173>。

推荐使用 Chrome 或 Edge，因为中文语音识别依赖浏览器的 Web Speech API。

## 手机端测试

服务器会同时启动：

- HTTP：`http://<电脑局域网IP>:4173`
- HTTPS：`https://<电脑局域网IP>:4174`

手机需要与电脑连接同一个 Wi-Fi。电脑当前局域网 IP 可通过 `server.log` 查看，也可以在 PowerShell 中运行：

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }
```

手机浏览器只有在 HTTPS 或 `localhost` 下才允许调用摄像头和麦克风，因此推荐使用 HTTPS。

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

## 使用方式

1. 点击“开启摄像头与麦克风”并允许权限。
2. 页面会优先尝试加载浏览器端手部识别；加载成功后，伸出手或握住魔杖即可跟踪。
3. 如果手部识别不可用，可以在魔杖尖端使用颜色标记，或直接使用有一定色彩的木杖，点击“校准魔杖尖端”并把目标保持在画面中央圆圈内约 2 秒。
4. 移动魔杖或手部，画面上会显示跟踪点。
5. 说出中文咒语，或点击咒语按钮，跟踪点会持续播放对应特效，直到说出“停止施法”或切换咒语。

## 中文咒语

- 荧光闪烁
- 除你武器
- 昏昏倒地
- 统统石化
- 羽加迪姆勒维奥萨
- 火焰熊熊
- 清水如泉
- 呼神护卫
- 阿瓦达索命
- 停止施法

## 实现说明

- `app.js`：摄像头画面处理、MediaPipe 手部识别、HSV 色块跟踪、粒子特效、中文语音识别。
- `server.js`：使用 Node.js 内置模块提供本地静态服务器。
- `certs/wand-server.pfx`：本地 HTTPS 服务器证书；`certs/wand-dev-ca.cer` 用于手机信任。
- 手部识别需要浏览器联网加载 MediaPipe 模型；联网不可用时自动回退到“彩色/木杖尖端校准 + 最大连通色块跟踪”。
