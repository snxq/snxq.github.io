---
layout: post
title: Verify Your Commit
date: 2019-09-17 15:16:14 +0800
categories: 技术
tags: git
---

在查看 github 的 commit 记录时，发现有的后面有个绿色的 Verified 小框，挺 cool。于是查了一番后，原来是因为用gpg密钥加密过的 commit 就会这样显示。

---

## 生成 GPG 密钥

由于我使用的是 gpg 版本为 2.0.24，所以按照 github 的文档给的命令不合适，所以使用 `gpg --gen-key` 命令生成。默认使用`gpg --full-generate-key`即可。

如果在最后生成的过程中卡住，那么就需要安装 rng-tools 生成随机数的工具。卡住的原因是系统熵池的大小不够，可通过 `cat /proc/sys/kernel/random/entropy_avail` 查看，通过启动 rngd 来增大熵池。

下面以我使用的 openSUSE 为例。

```bash
# install
zypper in rng-tools
# 启动服务
rngd -r /dev/urandom
```

## 将生成的密钥绑定到 GitHub

```bash
# 查看生成的 key id
gpg --list-secret-keys --keyid-format LONG
# 根据 ID 拿到 密钥
gpg --armor --export [GPG 密钥 ID]
# 复制密钥到 GitHub 。
```

## 设置本地 git

```bash
# 将 GPG 密钥和 git 绑定
git config --global user.signingkey [GPG 密钥 ID]
# 设置全局 commit 默认加密
git config --global commit.gpgsign true
```

---

参考 [GitHub 系列文档](https://help.github.com/cn/articles/generating-a-new-gpg-key)