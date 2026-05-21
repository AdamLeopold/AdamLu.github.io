# Lu Yuhang Personal Homepage

这是一个基于 CV 内容生成的静态个人主页，可以直接作为 GitHub Pages 站点使用。主页重点展示：

- NUS Research Assistant 经历
- LEAN-LLM-OPT 多智能体 LLM 自动优化建模框架
- Multi-Agent LLM reasoning / behavioral benchmark evaluation
- 欧洲天然气 TTF 多变量深度学习预测项目
- 国家级竞赛、专利与教育背景

## 本地预览

推荐使用本地静态服务器预览：

```bash
python3 -m http.server 4173
```

然后打开 `http://127.0.0.1:4173/index.html`。

## 发布到 GitHub Pages

1. 把这些文件推送到 GitHub 仓库。
2. 在仓库 `Settings -> Pages` 中选择 `GitHub Actions`。
3. 推送到 `main` 分支后，`.github/workflows/pages.yml` 会自动部署。

## 需要替换的个人信息

- `index.html` 中的 GitHub 链接
- `script.js` 中可继续补充项目仓库链接
- `index.html` 的 meta description
