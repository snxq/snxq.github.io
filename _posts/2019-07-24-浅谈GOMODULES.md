---
layout: post
title: "浅谈 GO MODULES"
date: 2019-07-24 20:14:34 +0800
categories: 技术
tags: golang
---

在B站推 GO MODULES 已经有一段时间了。截止目前，几乎所有的 golang 仓库都上手了 MODULES，今天有点时间就来写写这个过程。
 
## Background

golang 经常被吐槽没有官方的依赖库版本控制工具，而第三方的工具又很难用。这个是有历史原因的， golang 由 google 开发，然而 google 所有人都是基于共同一个大仓的开发模式，即所有的代码都在一个仓库里，所以根本不会存在依赖库版本混乱不一致的问题，官方自然没有动力去做这个东西。然而 golang 的发展很快，尤其是社区对依赖库版本控制工具的呼声愈来愈高，所以就在去年二月提出了 MODULES 的原型 vgo。七月份登陆了 golang 的主仓库，然后随着GO1.11版本在八月发布。当然，GO1.11 的 MODULES 只是一个预览版的功能，经历1.11和1.12两个版本的测试后，将在1.13正式成为默认的依赖库版本控制工具。
 
## GOMOD VS govendor

在实际的体验上，MODULES 确实要比之前使用的 govendor 工具要好很多。首先由于代码编译运行直接依赖的 vendor 目录代码 和 govendor 的配置文件不是强制绑定的，意味着 vendor 目录下的包有可能和配置文件对不上。这个问题普遍存在，有些包因为国情导致下载不到，然后很多开发通过 github 的镜像仓库下载代码后直接复制到 vendor 目录下，导致了 vendor 目录的混乱，虽说短期内编译运行是ok的，但没有通过工具管理，很容易产生版本不一致冲突等问题。
 
MODULES 则很直接，不依赖 GOPATH 以及 vendor 目录，仓库根目录下存在两个文件， go.mod 和 go.sum。前者用来控制项目需要的依赖库以及依赖库版本，后者负责依赖库一致性，即可能存在 force push 导致的版本相同但是代码不一致的 BUG。编译运行会实时检查修改 go.mod ，对依赖库进行下载或者版本的修改。

## GOMOD 简单使用

1. `export GO111MODULE=on` 。首先由于不依赖 GOPATH，所以在 1.13 版本之前，GO111MODULE 默认为 auto，即如果项目在 GOPATH 下面则默认关闭 GOMOD，反之开启。如果项目在 GOPATH 下面想要使用 GOMOD，则需要设置下环境变量或者在执行mod相关命令前面加上临时变量 `GO111MODULE=on`。
2. `go mod init xxx(repo_name)` 。初始化 gomod 项目。在根目录下生成 go.mod。go.mod 作为不可缺少的配置文件，主要有三部分。第一部分定义当前仓库的模块名称，此名称也将作为被引用的模块名，并且作为仓库内部的代码互相引用的前缀。第二部分定义使用的 golang 版本。第三部分给出所有依赖库的列表。
3. `go mod tidy`。检查项目代码，自动生成并下载依赖库。不仅仅是手动执行这句，当执行` go build/run/test ` 等 操作也会检查代码和下载依赖库。和之前不同的是，下载的依赖库将会在`$GOPATH/pkg/mod`里面。

## 关于代理

国内由于墙的问题，很多包会出现下载不到的情况，如果使用规模较小，可以使用大佬们搭的免费的 gomod 代理。goproxy.cn 或者 goproxy.io等。`export GOPROXY=https://goproxy.cn`。这里需要注意的是必须要使用 https。不使用 https 的话 url是明文
如果企业级的话建议搭个自用的代理，能够保证正确稳定。可以看下[这个](https://github.com/gomods/athens)。

## 关于 go.sum 

还有关于 go.sum 文件，很多人觉得没有必要。如果在svn中添加了 vendor目录的话，确实go.sum 的意义不是很大，但是若没有 vendor 目录，那么 go.sum 就是安全保障。强烈不建议删除。

## go.mod 中的指令

module、require、replace、exclude。这里说下 replace。这个指令很灵活，当需要引用fork后的项目时，或者需要引用本地项目时，都可以使用replace，将依赖库的地址指向指定的网络地址或者本地绝对或者相对地址。

## 关于 vendor 目录

gomod 并没有抛弃 vendor 目录，在执行 `go mod vendor` 之后，会将所有的依赖库下载到项目根目录的 vendor 目录下面。但是有一点要注意的是 vendor 是相对独立的，实际上要保证 vendor 与 go.mod 同步。

之前的CI中检查vendor目录，是在任务容器中将 vendor 删除掉，然后 ` go mod tidy && go mod vendor` 来检查 vendor 目录是否与 go.mod 同步。

## 关于 gomod 的编辑器设置

编辑器就目前来看，还是很不完善，如果怕麻烦的话，建议直接使用 GoLand 。

#### VSCode

安装 VSCode-Go 插件。使用以下配置。
```json
"go.useLanguageServer": true,
"go.languageServerExperimentalFeatures": {
        "diagnostics": true // for diagnostics as you type
},
"[go]": {
    "editor.snippetSuggestions": "none",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
        "source.organizeImports": true
    },
},
"gopls": {
    "usePlaceholders": true, // add parameter placeholders when completing a function
    "enhancedHover": true,   // experimental to improve quality of hover (will be on by default soon)
}
```

#### Vim

安装 vim-go。使用以下配置。
```
let g:go_def_mode='gopls'
```

#### Emacs

安装 lsp-mode。不需要额外配置。

- - -

我自己使用的 VS Code。当前使用的 go 插件版本为 0.11.4，设置只需要 `go.useLanguageServer: true` 这一句就好了，但是由于墙的问题，go tools 编辑器大多会安装失败，所以需要手动下载。设置 GOPROXY，分别安装一下 工具。
```
go get -u -v github.com/ramya-rao-a/go-outline
go get -u -v github.com/mdempsky/gocode
go get -u -v github.com/acroca/go-symbols
go get -u -v golang.org/x/tools/cmd/guru
go get -u -v golang.org/x/tools/cmd/gorename
go get -u -v github.com/stamblerre/gocode
go get -u -v github.com/sqs/goreturns
go get -u -v golang.org/x/tools/cmd/gopls
```
