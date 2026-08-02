# 霍格沃茨手势施法台

一个零依赖的可运行前端项目。浏览器请求摄像头与麦克风权限，通过手掌识别判断握拳蓄力和张开释放，并支持中文语音咒语或手动点击选择魔法。

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
2. 页面会优先加载手掌识别；必要时点击“校准手掌”，张开手掌放在圆圈中。
3. 说出中文咒语，或点击咒语按钮选择要释放的魔法。
4. 握拳开始蓄力，画面会显示蓄力百分比和蓄力环。
5. 张开手掌释放，蓄力越久，光束越长、持续越久，并会逐渐消失。

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

- `app.js`：摄像头画面处理、MediaPipe 手掌识别、握拳/张开手势判定、蓄力系统、光束特效、中文语音识别。
- `server.js`：使用 Node.js 内置模块提供本地静态服务器。
- `certs/wand-server.pfx`：本地 HTTPS 服务器证书；`certs/wand-dev-ca.cer` 用于手机信任。
- 只使用手掌/手势识别；不再使用颜色校准。
