---
layout: post
title: "Golang 项目 bazel 指北"
date: 2018-11-19 13:36:31 +0800
categories: 技术
tags: golang bazel
---

该文档主要介绍 Bazel 构建基本 golang 项目的案例, 主要了解在golang项目中如何使用bazel. 

## 概览
### 关键文件
1. WORKSPACE 在项目根目录，主要用来设置加载bazel环境（包括rules等）以及其依赖。
2. BUILD.bazel 存在于根目录以及源文件所在目录，用来标记源文件编译以及依赖情况，一般是自动生成。
### 工具
1. rules_go golang的官方rules，定义golang编译逻辑。
2. gazelle 用于生成golang build文件的工具。

## 项目构建
### 编辑WORKSPACE
```
# 加载bazel标准库中的函数 http_archive
load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")
# 调用http_archive下载rules_go
http_archive(
    name = "io_bazel_rules_go",
    # 下面两项需要根据官方的最近版本来修改
    urls = ["https://github.com/bazelbuild/rules_go/releases/download/0.16.1/rules_go-0.16.1.tar.gz"],
    sha256 = "f87fa87475ea107b3c69196f39c82b7bbf58fe27c62a338684c20ca17d1d8613",
)
# 获取gazelle
http_archive(
    name = "bazel_gazelle",
    # 同样需要根据官方最新版本修改
    urls = ["https://github.com/bazelbuild/bazel-gazelle/releases/download/0.15.0/bazel-gazelle-0.15.0.tar.gz"],
    sha256 = "6e875ab4b6bf64a38c352887760f21203ab054676d9c1b274963907e0768740d",
)
# 从rules_go中加载go_rules_dependencies,go_register_toolchains
load("@io_bazel_rules_go//go:def.bzl", "go_rules_dependencies", "go_register_toolchains")
# 加载rules_go依赖
go_rules_dependencies()
# 加载rules_go工具
go_register_toolchains()
# 从gazelle中加载gazelle_dependencies
load("@bazel_gazelle//:deps.bzl", "gazelle_dependencies")
# 加载gazelle依赖
gazelle_dependencies()
```

### 编辑根目录下的BUILD.bazel
```
# 加载gazelle
load("@bazel_gazelle//:def.bzl", "gazelle")
# gazelle:prefix [注意这句注释并非没有意义，中括号替换为该项目Name]
gazelle(name = "gazelle")
```

### 构建
1. 使用gazelle生成build文件
2. 使用生成的build文件构建项目代码
```
# 使用gazelle自动生成build文件
bazel run //:gazelle
 
# 使用生成的build文件构建
# 构建根目录下所有target
bazel build //...
# 构建特定taget
bazel build //path/of/target:target_name
```

## Demo项目
[Demo](https://github.com/yodark1995/multi-language-bazel-test)
