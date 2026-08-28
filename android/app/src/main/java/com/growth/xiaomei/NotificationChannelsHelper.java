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
 * 背景（红米 K60 实测）：通过 JS 桥调用 LocalNotifications.createChannel 时，
 * 部分 MIUI/HyperOS ROM 会让该调用永久挂起——第一个渠道卡住会占死桥线程，
 * 后续所有插件调用（含降级渠道、schedule）全部排队挂死（自检步骤3超时的根因）。
 * 而原生 NotificationManager API 是所有 App 的标准路径，不经 WebView 桥，无此故障面。
 * 渠道一旦存在，JS 侧只需 listChannels 查询验证，不再依赖 createChannel。
 *
 * 设计要点：
 * - 后台线程执行 + 全程 try-catch：任何 ROM 异常都不影响 App 启动与 UI；
 * - 先建「兼容渠道」（系统默认音，保底），再建「铃声渠道」（自带 alarm.wav）；
 * - 幂等：渠道已存在时 createNotificationChannel 等价于更新（声音等不可变字段保留原值）。
 */
public final class NotificationChannelsHelper {
    public static final String CH_RINGTONE = "growth_v3";  // 自定义铃声渠道（res/raw/alarm.wav）
    public static final String CH_FALLBACK = "growth_fb";  // 系统默认提示音渠道（最大兼容）

    private NotificationChannelsHelper() {}

    /** 在后台线程幂等创建两个提醒渠道；任何异常都只降级、绝不影响启动 */
    public static void ensureCreated(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;

                // ① 兼容渠道：系统默认通知音（不依赖任何自带资源，全 ROM 最稳）
                try {
                    NotificationChannel fb = new NotificationChannel(
                            CH_FALLBACK, "成长提醒", NotificationManager.IMPORTANCE_HIGH);
                    fb.setDescription("节点闹钟、习惯打卡与番茄钟提醒（系统默认提示音）");
                    fb.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                    fb.enableVibration(true);
                    fb.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                            buildAudioAttributes());
                    nm.createNotificationChannel(fb);
                } catch (Exception e) { /* 保底渠道失败不阻塞铃声渠道 */ }

                // ② 铃声渠道：app 自带 alarm.wav；资源异常时自动回落系统默认音
                try {
                    NotificationChannel v3 = new NotificationChannel(
                            CH_RINGTONE, "成长提醒", NotificationManager.IMPORTANCE_HIGH);
                    v3.setDescription("节点闹钟、习惯打卡与番茄钟提醒（系统级铃声）");
                    v3.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                    v3.enableVibration(true);
                    Uri sound;
                    try {
                        sound = Uri.parse("android.resource://" + app.getPackageName() + "/raw/alarm");
                    } catch (Exception e) {
                        sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                    }
                    v3.setSound(sound, buildAudioAttributes());
                    nm.createNotificationChannel(v3);
                } catch (Exception e) { /* 铃声渠道失败时 JS 侧自动降级 growth_fb */ }
            } catch (Exception e) {
                // 渠道创建失败绝不影响启动；JS 侧 listChannels 查不到时会走默认渠道兜底
            }
        }, "notify-channel-init").start();
    }

    private static AudioAttributes buildAudioAttributes() {
        return new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();
    }
}