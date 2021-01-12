---
layout: post
title: golang sql 连接超时探究
date: 2021-01-12 21:08:31 +0800
categories: 技术
tags: golang database sql timeout
---

前不久的一次线上数据库故障，让我注意到了 golang/sql 连接的超时问题。

## 设置连接超时的两种方式

### 1. SetMaxLifeTime && SetMaxIdleTime

这两个方法是官方标准库提供的，使用方式如下:

```golang
db, err := sql.Open("mysql", "root:@(127.0.0.1:3306)/oliver")
if err != nil {
    panic(err)
}
defer db.Close()
db.SetConnMaxLifetime(time.Second * 60) // 设置连接最大周期时间
db.SetConnMaxIdletime(time.Second * 30) // 设置连接最大空闲时间
```

在底层这两个方法的原理是一样的，通过方法 `connectionCleaner` 每秒对连接池 `freeConn` 中的连接进行超时判断，对已经超时的连接关闭操作。详见[代码](https://github.com/golang/go/blob/master/src/database/sql/sql.go#L1032)

需要注意的一点是，这里只对空闲连接检查，对于 `InUse` 的连接是无效的。所以像慢查询或者比较耗时的事务来说，这两个超时方法无能为力。接下来就请出第二种方法吧。

### 2. Context 超时设置

hhh, 感觉备受期待的方式竟然只是平平无奇路人皆知的 `context`。没错，先上代码。

```golang
db, err := sql.Open("mysql", "root:@(127.0.0.1:3306)/oliver")
if err != nil {
    panic(err)
}
defer db.Close()
ctx, cancel := context.WithCancel(context.Background())
go func() {
    time.Sleep(time.Second * 2)
    cancel()
}()
tx, err := db.BeginTx(ctx, nil)
if err != nil {
    panic(err)
}
defer tx.Rollback()
// do something
```

如代码所示， 通过上述方法可以实现对慢查询以及耗时事务的超时控制，避免因连接长时间占用导致数据库锁，继而引发连接堆积。

## 写在最后

这两种方式其实缺一不可，一般我们感觉是设置了 `SetConnMaxLifetime` 就万无一失，其实还是存在连接池爆掉的风险。

我认为还应该遵从以下两点:
1. 不要滥用事务。事务的职责应该清晰明了。
2. 设置合理的超时时间以及上面没有提到的最大连接数。
