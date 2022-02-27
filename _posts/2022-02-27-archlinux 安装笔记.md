---
layout: post
title: archlinux 安装笔记
date: 2022-02-27 04:22:21 +0800
categories: 技术
tags: arch linux
---

# archlinux 安装笔记

---

## 分区方案

| 序号 | 路径 | 大小 | 格式 | 用途 | 备注 |
| -- | -- | -- | -- | -- | -- |
| 1 | /efi | 512M | fat32 | UEFI 引导分区 | 如果不是 5 年前的主板，基本上现在都是用 UEFI 方式引导 |
| 2 |  | 4G | swap | 交换分区 |  |
| 3 | / | 32G | btrfs | 根目录 | btrfs 用于系统备份 |
| 4 | /home | 剩余所有空间 | ext4 | 用户目录 | |

## 基本组件&&常用软件

| 序号 | 名称 | 用途 | 备注 |
| -- | -- | -- | -- |
| 1 | pacman | package 管理 |  |
| 2 | yay | package 管理，用于安装 AUR 软件 | |
| 3 | dhcpcd | dhcp 客户端，用于网络连接 | |
| 4 | grub | 创建系统引导 | |
| 5 | xorg | 桌面系统基础组件 | 是 kde 的前置组件 |
| 6 | kde | 桌面环境 |  |
| 7 | sddm | 配合 kde 的显示管理器 | |
| 8 | konsole | kde 配套的终端 | |
| 9 | dolphin | kde 配套的文件管理器 | |
| 10 | chrome | 浏览器 | |
| 11 | fcitx5-rime | 输入法 | 配合 double_pinyin 真香 |
| 12 | netease-cloud-music | 音乐播放器 | |
| 13 | telegram | IM | |

## 操作命令一览

```bash
## livecd 环境下
## fdisk 分区命令忽略

## 初始化硬盘分区文件系统
mkfs.btrfs /dev/sda3 # 根分区
mkfs.ext4 /dev/sda4 # home 目录分区
mkfs.fat -F 32 /dev/sda1 # boot 分区
mkswap /dev/sda2 # 交换分区

## 加载分区

mount /dev/sda3 /mnt
mkdir /mnt/efi
mkdir /mnt/home
mount /dev/sda1 /mnt/efi
mount /dev/sda4 /mnt/home
swapon /dev/sda2 # 激活交换空间

## 安装基础软件包，linux 内核，常规硬件固件
pacstrap /mnt base linux linux-firmware

## 将当前分区生成到分区文件中，用于新系统加载
genfstab -U /mnt >> /mnt/etc/fstab

## 切换到新系统环境
arch-chroot /mnt

## 设置时间
ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
hwclock --systohc

## 安装必要的软件 这一步将会花费比较多的时间，视网速而定
## dhcpcd 默认新环境没有配套的网络设置，需要自行安装，这里我的环境只需要动态获取IP地址和路由就可以了。
## grub 为启动引导器，efibootmgr 则被 grub 脚本用来将启动项写进来
## xorg-server plasma sddm 则为桌面环境软件,这里采用传统的 x11 方式。
## fcitx5 系列则为中文输入法
## snapper 配合 btrfs 备份系统
pacman -Syu emacs git dhcpcd grub efibootmgr xorg-server plasma sddm base-devel fcitx5 fcitx5-qt fcitx5-gtk fcitx5-rime kim-fcitx5 snapper

## 导入自己的 emacs 配置
git clone https://github.com/snxq/.emacs.d.git ~/.emacs.d

## 启用 en_US.UTF-8,去掉前面的 '#'
emacs /etc/locale.gen
locale-gen
echo "LANG=en_US.UTF-8" >> /etc/locale.conf

## 设置默认自启动
systemctl enable sddm
systemctl enable dhcpcd

## 配置系统引导, 这里为 UEFI 方式
grub-install --target=x86_64-efi --efi-directory=/efi --bootloader-id=GRUB
grub-mkconfig -o /boot/grub/grub.cfg

## 设置用户
passwd # 设置 root 密码
useradd -m -G wheel oliver # 创建非 root 用户，设置密码并赋予 sudo 权限
passwd oliver
chmod 600 /etc/sudoers ## 赋予 root 可修改权限
emacs /etc/sudoers ## 赋予 wheel 用户组可 sudo 权限，去掉 wheel 权限前面的 '#'

## 创建文件写入下面的内容,设置 fcitx5
emacs ~/.pam_environment
# INPUT_METHOD  DEFAULT=fcitx5
# GTK_IM_MODULE DEFAULT=fcitx5
# QT_IM_MODULE  DEFAULT=fcitx5
# XMODIFIERS    DEFAULT=\@im=fcitx5

## 切换到非 root 用户, 安装 AUR Helper
su oliver
mkdir ~/src
cd ~/src
git clone https://aur.archlinux.org/yay-git.git
cd yay-git
makepkg -si

## 使用 yay 安装其他软件
yay -S google-chrome netease-cloud-music telegram

## 手动备份系统
snapper -c config create-config / # 创建根目录的配置文件
snapper -c config create --description 202202272132 # 手动创建快照
snapper -c config list # config 配置下的快照列表
snapper -c config delete xx # 删除快照 xx为快照序号

reboot # 大功告成

## 还有一些诸如 ssh,gpg 等配置就自由发挥了
```
