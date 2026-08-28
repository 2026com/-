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
 * ① LocalNotifications 插件桥在该 ROM 挂起 → 渠道由本类原生直建；
 * ② MIUI 对新建渠道默认「无声/无振动/无悬浮/锁屏不显示」→ 渠道必须收敛到最少，
 *    用户只需在系统设置里配置一次（通知→成长小美→「成长提醒」渠道 → 开声音/振动/悬浮，
 *    声音可换成任意系统铃声/歌曲）；
 * ③ 渠道铃声一律用系统默认通知音（用户在系统里可改），不做 app 内置铃声。
 *
 * 渠道规划（只保留 2 个）：
 * - growth_notify：唯一提醒渠道（铃声=系统默认通知音，用户系统里可改）
 * - growth_guard ：守护服务常驻通知（IMPORTANCE_MIN，无声，无需用户配置）
 *
 * 启动时自动清理历史废弃渠道（growth_ring_* / growth_v3 / growth_fb / default）。
 */
public final class NotificationChannelsHelper {
    public static final String NOTIFY = "growth_notify";  // 唯一提醒渠道
    public static final String CH_GUARD = "growth_guard"; // 守护服务常驻通知（无声）

    /** 历史废弃渠道（自动删除，减少用户系统设置里的混乱项） */
    private static final String[] LEGACY_IDS = {
            "growth_ring_default", "growth_ring_alarm", "growth_ring_soft", "growth_ring_urgent",
            "growth_v3", "growth_fb", "default",
    };

    private NotificationChannelsHelper() {}

    /** 后台线程幂等执行：建 2 个渠道 + 清理废弃渠道；任何异常绝不影响启动 */
    public static void ensureCreated(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;
                // ① 唯一提醒渠道：系统默认通知音（用户在系统设置里可换成任意铃声/歌曲）
                try {
                    if (nm.getNotificationChannel(NOTIFY) == null) {
                        NotificationChannel c = new NotificationChannel(NOTIFY, "成长提醒",
                                NotificationManager.IMPORTANCE_HIGH);
                        c.setDescription("节点闹钟、习惯打卡与番茄钟提醒");
                        c.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                        c.enableVibration(true);
                        c.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                                buildAudioAttributes());
                        nm.createNotificationChannel(c);
                    }
                } catch (Throwable t) { /* ignore */ }
                // ② 守护服务渠道（MIN：无声、不横幅；前台服务必需）
                try {
                    if (nm.getNotificationChannel(CH_GUARD) == null) {
                        NotificationChannel g = new NotificationChannel(CH_GUARD, "提醒守护",
                                NotificationManager.IMPORTANCE_MIN);
                        g.setDescription("保持提醒准时的后台服务通知（无声）");
                        g.setSound(null, null);
                        g.enableVibration(false);
                        g.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
                        nm.createNotificationChannel(g);
                    }
                } catch (Throwable t) { /* ignore */ }
                // ③ 清理历史废弃渠道
                for (String id : LEGACY_IDS) {
                    try {
                        if (nm.getNotificationChannel(id) != null) nm.deleteNotificationChannel(id);
                    } catch (Throwable t) { /* ignore */ }
                }
            } catch (Throwable t) { /* 渠道操作失败绝不影响启动 */ }
        }, "notify-channel-init").start();
    }

    private static AudioAttributes buildAudioAttributes() {
        return new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();
    }
}