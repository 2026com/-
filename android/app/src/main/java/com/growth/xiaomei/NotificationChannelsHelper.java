package com.growth.xiaomei;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

/**
 * 原生侧直接创建通知渠道（完全绕开 Capacitor 插件桥）。
 *
 * 背景（红米 K60 实测）：
 * ① 经 LocalNotifications 插件桥的 createChannel 永久挂起 → 改由本类原生直建；
 * ② android.resource:// 形式的渠道铃声 URI 在该 ROM「存得住、放不出」（渠道在、触发时静默无声）
 *    → 自带铃声改用 SoundStore 生成的 content://（FileProvider）URI，全 ROM 可靠。
 *
 * 渠道规划（铃声创建后不可变 → 一个铃声一个固定渠道；URI 变更时自动删除重建完成迁移）：
 * - growth_ring_default：系统默认提示音
 * - growth_ring_alarm ：alarm.wav（清脆铃声）  [content://]
 * - growth_ring_soft  ：soft.wav（柔和提示）    [content://]
 * - growth_ring_urgent：urgent.wav（急促闹铃）  [content://]
 * - growth_guard      ：守护服务常驻通知（IMPORTANCE_MIN）
 * - growth_v3 / growth_fb：历史渠道保留（v3 含用户系统里自定义的铃声，仍作回退可用）。
 */
public final class NotificationChannelsHelper {
    public static final String RING_DEFAULT = "growth_ring_default";
    public static final String RING_ALARM   = "growth_ring_alarm";
    public static final String RING_SOFT    = "growth_ring_soft";
    public static final String RING_URGENT  = "growth_ring_urgent";
    public static final String CH_GUARD     = "growth_guard";
    public static final String CH_FALLBACK  = "growth_fb";  // 旧兼容渠道（保留）

    private NotificationChannelsHelper() {}

    /** 后台线程幂等创建全部渠道；任何异常只降级、绝不影响启动 */
    public static void ensureCreated(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;
                create(app, nm, RING_DEFAULT, null, "系统默认提示音");
                create(app, nm, RING_ALARM, "alarm", "清脆铃声");
                create(app, nm, RING_SOFT, "soft", "柔和提示");
                create(app, nm, RING_URGENT, "urgent", "急促闹铃");
                create(app, nm, CH_FALLBACK, null, "系统默认提示音");
            } catch (Throwable t) { /* 渠道创建失败绝不影响启动 */ }
        }, "notify-channel-init").start();
    }

    /** 幂等创建渠道：铃声 URI 与期望不一致（如旧版 resource:// 迁移）时删除重建 */
    private static void create(Context app, NotificationManager nm, String id, String rawName, String desc) {
        try {
            Uri want = resolveSound(app, rawName);
            NotificationChannel existing = nm.getNotificationChannel(id);
            if (existing != null) {
                Uri cur = existing.getSound();
                boolean same = cur != null && want != null && cur.toString().equals(want.toString());
                if (same) return;                       // 一致：保留（铃声不可变，含用户自定义）
                nm.deleteNotificationChannel(id);       // 不一致：删除重建（迁移旧 URI）
            }
            NotificationChannel c = new NotificationChannel(id, "成长提醒", NotificationManager.IMPORTANCE_HIGH);
            c.setDescription("节点闹钟、习惯打卡与番茄钟提醒（" + desc + "）");
            c.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            c.enableVibration(true);
            c.setSound(want, buildAudioAttributes());
            nm.createNotificationChannel(c);
        } catch (Throwable t) { /* 单渠道失败不影响其他渠道 */ }
    }

    /** 铃声解析：自带 wav → content:// URI；系统默认 → 系统通知音；失败一律回落系统默认音。 */
    private static Uri resolveSound(Context app, String rawName) {
        Uri fallback = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        if (rawName == null) return fallback;
        try {
            Uri content = SoundStore.soundUri(app, rawName);
            return content != null ? content : fallback;
        } catch (Throwable t) {
            return fallback;
        }
    }

    private static AudioAttributes buildAudioAttributes() {
        return new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();
    }
}