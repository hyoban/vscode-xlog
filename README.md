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

You can download your posts or create/update a post by right-clicking your markdown file.

![](./doc/demo/ScreenShot%202024-03-19%2013.46.46.mp4)
![](./doc/demo/ScreenShot%202024-03-19%2013.50.34.mp4)
