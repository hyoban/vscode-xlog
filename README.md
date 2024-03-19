# vscode xLog

<a href="https://marketplace.visualstudio.com/items?itemName=hyoban.xlog" target="__blank"><img src="https://img.shields.io/visual-studio-marketplace/v/hyoban.xlog.svg?color=eee&amp;label=VS%20Code%20Marketplace&logo=visual-studio-code" alt="Visual Studio Marketplace Version" /></a>

## Usage

Create a configuration in your vscode settings.json file:

```json
{
  "xlog.handle": "hyoban",
  "xlog.post-folder": "posts",
  "xlog.token": "your-token"
}
```

> [!CAUTION]
> Do not commit your token to your repository. You should put it in your user settings, and other settings in your workspace settings.

To get your token, go to your xLog dashboard, open developer tools, and run the following code:

```javascript
JSON.parse(localStorage.getItem("connect-kit:account")).state.wallet.siwe.token;
```

> [!NOTE]
> Read more: [技术折腾 xLog 2 深入理解 xlog 的鉴权](https://blog.ijust.cc/play-xlog-02)

You can download your posts or create/update a post by right-clicking your markdown file.

https://github.com/hyoban/vscode-xlog/assets/38493346/28b0ffbc-47dd-41da-a185-d2f727814a61

https://github.com/hyoban/vscode-xlog/assets/38493346/42fbdf40-0430-484a-9cad-50217e8b7c9d
