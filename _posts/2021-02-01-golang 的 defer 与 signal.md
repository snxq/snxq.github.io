---
layout: post
title: golang 的 defer 与 signal
date: 2021-02-01 22:20:01 +0800
categories: 技术
tags: golang defer signal
---

在一次平平无奇的下午，望着前面的代码，突然嗅到了 bug 的味道。

```go
func main() {
    f, err := pkg.Open()
    if err != nil {
    	log.Fatalf("xxx open failed. Err: %+v", err)
    }
    defer func() {
        log.Info("start to clean...")
        if err := f.Close(); err != nil {
            log.Fatalf("close xxx failed. Err: %+v", err)
        }
    }()
    for {
        // do something
    }
}
```

如上所示，主函数进入死循环处理业务后，如果程序退出后就会执行 `defer` 完成 `clean` 动作。但是真的会这样吗？

一般我们退出这类程序，常见的有两种方式。开发时的 `Ctrl + C` 以及托管服务的 `service/systemctl` 等，这时系统会向程序发送 `SIGINT` 或者 `SIGTERM` 信号，程序默认执行 `os.Exit(1)` 退出。

再来看看 defer，它会在 函数 return, panic, 程序正常退出 之前运行，并不包含 os.Exit 。Exit 函数的描述是这样的，最后一句话强调，会立刻退出不会执行 defer 。

> Exit causes the current program to exit with the given status code. Conventionally, code zero indicates success, non-zero an error. The program **terminates immediately**; deferred functions are **not** run.

所以上述代码的结果就是结束后并不会执行清理动作，看来还是得对症下药啊。

```go
func main() {
    f, err := pkg.Open()
    if err != nil {
    	log.Fatalf("xxx open failed. Err: %+v", err)
    }
    sig := make(chan os.Signal, 1)
    signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
    go func() {
        <-sig
        log.Info("start to clean...")
        if err := f.Close(); err != nil {
            log.Fatalf("close xxx failed. Err: %+v", err)
        }
        os.Exit(1)
    }()
    
    for {
        // do something
    }
}
```

one more thing， 可别捕捉到信号忘记退出哦（特殊处理除外
