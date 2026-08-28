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
 * 背景（红米 K60 实测）：该 ROM 上经 LocalNotifications 插件桥的 createChannel 永久挂起，
 * 而原生 NotificationManager API（所有 App 的标准路径）正常。渠道在 App 启动时由本类直建，
 * JS 侧只做查询验证。
 *
 * 渠道规划（Android 渠道铃声创建后不可变 → 每个铃声固定一个渠道 id，App 内换铃声 = 换渠道）：
 * - growth_ring_default：系统默认提示音
 * - growth_ring_alarm ：res/raw/alarm.wav（清脆铃声，历史默认）
 * - growth_ring_soft  ：res/raw/soft.wav（柔和提示）
 * - growth_ring_urgent：res/raw/urgent.wav（急促闹铃）
 * - growth_guard      ：前台守护服务常驻通知（IMPORTANCE_MIN，无声不打扰）
 * - growth_v3 / growth_fb：历史渠道，保留不删（避免丢用户在系统里的自定义），不再使用。
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
                // 系统默认提示音渠道
                create(app, nm, RING_DEFAULT, null, "系统默认提示音");
                // app 自带铃声渠道（资源缺失时回落系统默认音）
                create(app, nm, RING_ALARM, "alarm", "清脆铃声");
                create(app, nm, RING_SOFT, "soft", "柔和提示");
                create(app, nm, RING_URGENT, "urgent", "急促闹铃");
                // 历史兼容渠道（保留以防旧渠道被用户自定义过）
                create(app, nm, CH_FALLBACK, null, "系统默认提示音");
            } catch (Throwable t) { /* 渠道创建失败绝不影响启动 */ }
        }, "notify-channel-init").start();
    }

    private static void create(Context app, NotificationManager nm, String id, String rawName, String desc) {
        try {
            if (nm.getNotificationChannel(id) != null) return; // 已存在：铃声不可变，跳过（保留用户自定义）
            NotificationChannel c = new NotificationChannel(id, "成长提醒", NotificationManager.IMPORTANCE_HIGH);
            c.setDescription("节点闹钟、习惯打卡与番茄钟提醒（" + desc + "）");
            c.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            c.enableVibration(true);
            Uri sound;
            try {
                sound = rawName != null
                        ? Uri.parse("android.resource://" + app.getPackageName() + "/raw/" + rawName)
                        : RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            } catch (Throwable t) {
                sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            c.setSound(sound, buildAudioAttributes());
            nm.createNotificationChannel(c);
        } catch (Throwable t) { /* 单渠道失败不影响其他渠道 */ }
    }

    private static AudioAttributes buildAudioAttributes() {
        return new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();
    }
}